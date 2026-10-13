using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using UnityEditor;
using UnityEngine;
using UnityEngine.UIElements;

namespace Guidon.Tasks.Editor
{
    /// <summary>
    /// The project's moodboard (reference images / concept art from the
    /// website's Knowledge → Moodboard) as a thumbnail grid. Images live in
    /// memory as textures until "Save to Assets" copies one into the project.
    /// Uses the same login as the Tasks window.
    /// </summary>
    public class GuidonMoodboardWindow : EditorWindow
    {
        private const float TileWidth = 180f;
        private const float TileHeight = 135f;
        private const string AssetsFolder = "Assets/Guidon References";

        [MenuItem("Window/Guidon/Moodboard")]
        public static void ShowWindow()
        {
            var window = GetWindow<GuidonMoodboardWindow>();
            window.titleContent = new GUIContent("Guidon Moodboard");
            window.minSize = new Vector2(420, 320);
        }

        private ProjectDto[] _projects = Array.Empty<ProjectDto>();
        private string[] _projectLabels = Array.Empty<string>();
        private string _projectId;
        private ReferenceDto[] _references = Array.Empty<ReferenceDto>();
        private readonly Dictionary<string, Texture2D> _textures = new Dictionary<string, Texture2D>();
        private readonly Dictionary<string, byte[]> _bytes = new Dictionary<string, byte[]>();
        private readonly HashSet<string> _failed = new HashSet<string>();
        private readonly Dictionary<string, Image> _tileImages = new Dictionary<string, Image>();
        private int _generation;
        private string _tag = string.Empty;
        private string _query = string.Empty;
        private ReferenceDto _open;

        private DropdownField _projectDropdown;
        private Label _status;
        private VisualElement _tags;
        private VisualElement _grid;
        private VisualElement _overlay;
        private Image _overlayImage;
        private Label _overlayCaption;
        private Button _sourceButton;
        private Button _saveButton;

        public void CreateGUI()
        {
            VisualElement root = rootVisualElement;
            root.style.flexGrow = 1;
            GuidonStyles.StyleRoot(root);
            GuidonStyles.SetPadding(root, 8f);

            if (!GuidonSettings.IsConfigured)
            {
                var hint = new Label("Log In from Window > Guidon > Tasks first.");
                GuidonStyles.StyleMutedLabel(hint);
                root.Add(hint);
                return;
            }

            var toolbar = new VisualElement { style = { flexDirection = FlexDirection.Row, alignItems = Align.Center, marginBottom = 6f, flexWrap = Wrap.Wrap } };
            _projectDropdown = new DropdownField { style = { width = 220f } };
            GuidonStyles.StyleInputBox(_projectDropdown);
            _projectDropdown.style.marginBottom = 0f;
            _projectDropdown.RegisterValueChangedCallback(evt =>
            {
                int index = Array.IndexOf(_projectLabels, evt.newValue);
                if (index < 0 || _projects[index].id == _projectId) return;
                _projectId = _projects[index].id;
                GuidonSettings.ProjectId = _projectId;
                _ = LoadReferences();
            });
            toolbar.Add(_projectDropdown);

            var refresh = new Button(() => { _ = LoadReferences(); }) { text = "↻ Refresh", style = { marginLeft = 4f } };
            GuidonStyles.StyleSecondaryButton(refresh);
            toolbar.Add(refresh);

            var browser = new Button(() =>
            {
                if (!string.IsNullOrEmpty(_projectId))
                    Application.OpenURL($"{GuidonSettings.BaseUrl.TrimEnd('/')}/projects/{_projectId}/references");
            }) { text = "Open in Browser", tooltip = "Add images on the Guidon website", style = { marginLeft = 4f } };
            GuidonStyles.StyleSecondaryButton(browser);
            toolbar.Add(browser);

            _status = new Label { style = { marginLeft = 8f } };
            GuidonStyles.StyleMutedLabel(_status);
            toolbar.Add(_status);
            root.Add(toolbar);

            var search = new TextField { style = { marginBottom = 4f } };
            GuidonStyles.AddLabeledField(root, "Search captions and tags", search);
            search.RegisterValueChangedCallback(evt =>
            {
                _query = evt.newValue ?? string.Empty;
                RebuildGrid();
            });

            _tags = new VisualElement { style = { flexDirection = FlexDirection.Row, flexWrap = Wrap.Wrap, marginBottom = 6f } };
            root.Add(_tags);

            var scroll = new ScrollView(ScrollViewMode.Vertical) { style = { flexGrow = 1 } };
            _grid = new VisualElement { style = { flexDirection = FlexDirection.Row, flexWrap = Wrap.Wrap } };
            scroll.Add(_grid);
            root.Add(scroll);

            BuildOverlay(root);
            _ = LoadProjects();
        }

        private void OnDisable() => DestroyTextures();

        private void BuildOverlay(VisualElement root)
        {
            _overlay = new VisualElement
            {
                style =
                {
                    position = Position.Absolute, left = 0, right = 0, top = 0, bottom = 0,
                    backgroundColor = new Color(0f, 0f, 0f, 0.85f), display = DisplayStyle.None,
                    paddingLeft = 16f, paddingRight = 16f, paddingTop = 16f, paddingBottom = 16f,
                },
            };
            _overlay.RegisterCallback<ClickEvent>(evt =>
            {
                if (evt.target == _overlay) CloseOverlay();
            });

            _overlayImage = new Image { scaleMode = ScaleMode.ScaleToFit, style = { flexGrow = 1 } };
            _overlay.Add(_overlayImage);
            _overlayCaption = new Label { style = { color = Color.white, marginTop = 6f, whiteSpace = WhiteSpace.Normal } };
            _overlay.Add(_overlayCaption);

            var buttons = new VisualElement { style = { flexDirection = FlexDirection.Row, marginTop = 6f } };
            _sourceButton = new Button(() =>
            {
                string url = _open?.source_url;
                if (!string.IsNullOrEmpty(url) && (url.StartsWith("https://") || url.StartsWith("http://")))
                    Application.OpenURL(url);
            }) { text = "Open source" };
            GuidonStyles.StyleSecondaryButton(_sourceButton);
            buttons.Add(_sourceButton);
            _saveButton = new Button(SaveOpenToAssets) { text = "Save to Assets", tooltip = "Copy this image into " + AssetsFolder, style = { marginLeft = 4f } };
            GuidonStyles.StylePrimaryButton(_saveButton);
            buttons.Add(_saveButton);
            var close = new Button(CloseOverlay) { text = "Close", style = { marginLeft = 4f } };
            GuidonStyles.StyleSecondaryButton(close);
            buttons.Add(close);
            _overlay.Add(buttons);
            root.Add(_overlay);
        }

        private async Task LoadProjects()
        {
            _status.text = "Loading...";
            var result = await GuidonApiClient.ListProjects();
            if (!result.Ok)
            {
                _status.text = result.Error;
                return;
            }

            _projects = result.Value;
            _projectLabels = _projects
                .Select(p => _projects.Count(other => other.name == p.name) > 1 ? $"{p.name} ({p.id.Substring(0, Math.Min(8, p.id.Length))})" : p.name)
                .ToArray();
            _projectDropdown.choices = _projectLabels.ToList();

            int index = Array.FindIndex(_projects, p => p.id == GuidonSettings.ProjectId);
            if (index < 0 && _projects.Length > 0) index = 0;
            if (index < 0)
            {
                _status.text = "No projects.";
                return;
            }

            _projectId = _projects[index].id;
            _projectDropdown.SetValueWithoutNotify(_projectLabels[index]);
            await LoadReferences();
        }

        private async Task LoadReferences()
        {
            if (string.IsNullOrEmpty(_projectId)) return;
            int generation = ++_generation;
            DestroyTextures();
            _references = Array.Empty<ReferenceDto>();
            _tag = string.Empty;
            RebuildGrid();
            _status.text = "Loading...";

            var result = await GuidonApiClient.ListReferences(_projectId);
            if (generation != _generation || this == null) return;
            if (!result.Ok)
            {
                _status.text = result.Error;
                return;
            }

            _references = result.Value.Where(r => r != null && !string.IsNullOrEmpty(r.id)).ToArray();
            _status.text = _references.Length == 0 ? "No images yet - add them on the website." : $"{_references.Length} image(s)";
            RebuildGrid();

            foreach (var reference in _references)
            {
                // Texture2D.LoadImage only understands PNG and JPEG.
                bool supported = reference.mime_type == "image/png" || reference.mime_type == "image/jpeg";
                var download = supported ? await GuidonApiClient.DownloadImage(reference.image_url) : GuidonResult<byte[]>.Failure("Unsupported format.");
                if (generation != _generation || this == null) return;

                var texture = new Texture2D(2, 2) { hideFlags = HideFlags.HideAndDontSave };
                if (download.Ok && texture.LoadImage(download.Value))
                {
                    _textures[reference.id] = texture;
                    _bytes[reference.id] = download.Value;
                }
                else
                {
                    DestroyImmediate(texture);
                    _failed.Add(reference.id);
                }
                UpdateTile(reference.id);
            }
        }

        private IEnumerable<ReferenceDto> Filtered()
        {
            string needle = _query.Trim().ToLowerInvariant();
            return _references.Where(r =>
            {
                var tags = r.tags ?? Array.Empty<string>();
                if (_tag.Length > 0 && !tags.Contains(_tag)) return false;
                if (needle.Length == 0) return true;
                return $"{r.caption} {r.name} {string.Join(" ", tags)}".ToLowerInvariant().Contains(needle);
            });
        }

        private void RebuildGrid()
        {
            if (_grid == null) return;

            _tags.Clear();
            var allTags = _references.SelectMany(r => r.tags ?? Array.Empty<string>()).Distinct().OrderBy(t => t).ToList();
            if (allTags.Count > 0)
            {
                foreach (string tag in new[] { string.Empty }.Concat(allTags))
                {
                    string value = tag;
                    var chip = new Button(() =>
                    {
                        _tag = value;
                        RebuildGrid();
                    }) { text = value.Length > 0 ? value : "All", style = { marginRight = 4f, marginBottom = 4f } };
                    if (value == _tag) GuidonStyles.StylePrimaryButton(chip);
                    else GuidonStyles.StyleSecondaryButton(chip);
                    _tags.Add(chip);
                }
            }

            _grid.Clear();
            _tileImages.Clear();
            foreach (var reference in Filtered())
                _grid.Add(BuildTile(reference));
        }

        private VisualElement BuildTile(ReferenceDto reference)
        {
            string caption = string.IsNullOrEmpty(reference.caption) ? reference.name : reference.caption;
            var tile = new VisualElement
            {
                tooltip = caption,
                style = { width = TileWidth, marginRight = 8f, marginBottom = 8f },
            };
            GuidonStyles.StyleCard(tile, false);
            tile.RegisterCallback<ClickEvent>(_ => OpenOverlay(reference));

            var image = new Image { scaleMode = ScaleMode.ScaleAndCrop, style = { height = TileHeight } };
            _tileImages[reference.id] = image;
            tile.Add(image);
            var label = new Label(caption) { style = { overflow = Overflow.Hidden, textOverflow = TextOverflow.Ellipsis, whiteSpace = WhiteSpace.NoWrap, marginTop = 4f } };
            GuidonStyles.StyleBodyLabel(label);
            tile.Add(label);
            UpdateTile(reference.id);
            return tile;
        }

        private void UpdateTile(string id)
        {
            if (!_tileImages.TryGetValue(id, out var image)) return;
            if (_textures.TryGetValue(id, out var texture))
            {
                image.image = texture;
                image.Clear();
                return;
            }
            image.Clear();
            var placeholder = new Label(_failed.Contains(id) ? "Image unavailable" : "Loading...")
            {
                style = { unityTextAlign = TextAnchor.MiddleCenter, flexGrow = 1 },
            };
            GuidonStyles.StyleMutedLabel(placeholder);
            image.Add(placeholder);
        }

        private void OpenOverlay(ReferenceDto reference)
        {
            _open = reference;
            _textures.TryGetValue(reference.id, out var texture);
            _overlayImage.image = texture;
            string caption = string.IsNullOrEmpty(reference.caption) ? reference.name : reference.caption;
            var tags = reference.tags ?? Array.Empty<string>();
            _overlayCaption.text = tags.Length > 0 ? $"{caption}  ·  {string.Join(", ", tags)}" : caption;
            _sourceButton.style.display = string.IsNullOrEmpty(reference.source_url) ? DisplayStyle.None : DisplayStyle.Flex;
            _saveButton.SetEnabled(_bytes.ContainsKey(reference.id));
            _overlay.style.display = DisplayStyle.Flex;
        }

        private void CloseOverlay()
        {
            _open = null;
            _overlay.style.display = DisplayStyle.None;
        }

        private void SaveOpenToAssets()
        {
            if (_open == null || !_bytes.TryGetValue(_open.id, out var bytes)) return;

            string extension = _open.mime_type == "image/png" ? ".png" : ".jpg";
            string baseName = Path.GetFileNameWithoutExtension(string.IsNullOrEmpty(_open.caption) ? _open.name : _open.caption);
            foreach (char c in Path.GetInvalidFileNameChars()) baseName = baseName.Replace(c, '_');
            if (string.IsNullOrWhiteSpace(baseName)) baseName = "Reference";

            if (!AssetDatabase.IsValidFolder(AssetsFolder))
                AssetDatabase.CreateFolder("Assets", Path.GetFileName(AssetsFolder));
            string path = AssetDatabase.GenerateUniqueAssetPath($"{AssetsFolder}/{baseName}{extension}");
            File.WriteAllBytes(path, bytes);
            AssetDatabase.ImportAsset(path);
            EditorGUIUtility.PingObject(AssetDatabase.LoadAssetAtPath<Texture2D>(path));
            ShowNotification(new GUIContent("Saved to " + path));
        }

        private void DestroyTextures()
        {
            foreach (var texture in _textures.Values)
                if (texture != null) DestroyImmediate(texture);
            _textures.Clear();
            _bytes.Clear();
            _failed.Clear();
        }
    }
}
