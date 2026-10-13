#include "SGuidonMoodboardWidget.h"

#include "Engine/Texture2D.h"
#include "Framework/Application/SlateApplication.h"
#include "GuidonApiClient.h"
#include "GuidonSettings.h"
#include "GuidonStyle.h"
#include "HAL/PlatformProcess.h"
#include "ImageUtils.h"
#include "Styling/AppStyle.h"
#include "Widgets/Images/SImage.h"
#include "Widgets/Input/SButton.h"
#include "Widgets/Input/SSearchBox.h"
#include "Widgets/Layout/SBorder.h"
#include "Widgets/Layout/SBox.h"
#include "Widgets/Layout/SScaleBox.h"
#include "Widgets/Layout/SScrollBox.h"
#include "Widgets/Layout/SWrapBox.h"
#include "Widgets/SWindow.h"
#include "Widgets/Text/STextBlock.h"

#define LOCTEXT_NAMESPACE "GuidonTasks"

namespace
{
	constexpr float TileWidth = 180.f;
	constexpr float TileHeight = 135.f;

	TSharedRef<STextBlock> MakeText(const FText& Text, int32 Size = 9, FLinearColor Color = GuidonStyle::Text())
	{
		return SNew(STextBlock).Text(Text).Font(GuidonStyle::Font(Size)).ColorAndOpacity(FSlateColor(Color));
	}

	void OpenUrl(const FString& Url)
	{
		if (Url.StartsWith(TEXT("https://")) || Url.StartsWith(TEXT("http://")))
		{
			FPlatformProcess::LaunchURL(*Url, nullptr, nullptr);
		}
	}
}

TWeakPtr<SGuidonMoodboardWidget> SGuidonMoodboardWidget::WeakSelf()
{
	return StaticCastSharedRef<SGuidonMoodboardWidget>(AsShared());
}

void SGuidonMoodboardWidget::Construct(const FArguments& InArgs)
{
	ChildSlot
	[
		SNew(SBorder)
		.BorderImage(GuidonStyle::WindowBrush())
		.Padding(8.f)
		[
			SNew(SVerticalBox)
			+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 0.f, 0.f, 6.f)
			[
				SNew(SHorizontalBox)
				+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center)
				[
					SNew(STextBlock)
					.Font(GuidonStyle::Font(11, true))
					.ColorAndOpacity(FSlateColor(GuidonStyle::Text()))
					.Text_Lambda([this]()
					{
						return ProjectName.IsEmpty()
							? LOCTEXT("MoodboardTitle", "Moodboard")
							: FText::Format(LOCTEXT("MoodboardTitleProject", "Moodboard · {0}"), FText::FromString(ProjectName));
					})
				]
				+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center).Padding(8.f, 0.f, 0.f, 0.f)
				[
					SNew(SButton)
					.Text(LOCTEXT("Refresh", "Refresh"))
					.ToolTipText(LOCTEXT("MoodboardRefreshTip", "Reload the project picked in the Guidon Tasks tab"))
					.OnClicked_Lambda([this]() { Reload(); return FReply::Handled(); })
				]
				+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center).Padding(6.f, 0.f, 0.f, 0.f)
				[
					SNew(SButton)
					.Text(LOCTEXT("OpenInBrowser", "Open in Browser"))
					.ToolTipText(LOCTEXT("MoodboardBrowserTip", "Add images on the Guidon website"))
					.IsEnabled_Lambda([this]() { return !ProjectId.IsEmpty(); })
					.OnClicked_Lambda([this]()
					{
						FString BaseUrl = FGuidonSettings::GetBaseUrl();
						BaseUrl.RemoveFromEnd(TEXT("/"));
						OpenUrl(FString::Printf(TEXT("%s/projects/%s/references"), *BaseUrl, *ProjectId));
						return FReply::Handled();
					})
				]
				+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center).Padding(8.f, 0.f, 0.f, 0.f)
				[
					SNew(STextBlock)
					.Font(GuidonStyle::Font(8))
					.ColorAndOpacity(FSlateColor(GuidonStyle::MutedText()))
					.Text_Lambda([this]() { return StatusText; })
				]
				+ SHorizontalBox::Slot().FillWidth(1.f).VAlign(VAlign_Center).Padding(12.f, 0.f, 0.f, 0.f)
				[
					SNew(SSearchBox)
					.HintText(LOCTEXT("MoodboardSearch", "Search captions and tags"))
					.OnTextChanged_Lambda([this](const FText& Text)
					{
						Query = Text.ToString();
						RebuildGrid();
					})
				]
			]
			+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 0.f, 0.f, 6.f)
			[
				SAssignNew(TagsBox, SWrapBox).UseAllottedSize(true)
			]
			+ SVerticalBox::Slot().FillHeight(1.f)
			[
				SNew(SScrollBox)
				+ SScrollBox::Slot()
				[
					SAssignNew(Grid, SWrapBox).UseAllottedSize(true)
				]
			]
		]
	];

	Reload();
}

void SGuidonMoodboardWidget::Reload()
{
	const int32 ThisGeneration = ++Generation;
	ProjectId = FGuidonSettings::GetProjectId();
	ProjectName.Reset();
	References.Reset();
	ActiveTag.Reset();
	RebuildTags();
	RebuildGrid();
	Images.Reset();
	Failed.Reset();

	if (!FGuidonSettings::IsConfigured())
	{
		StatusText = LOCTEXT("MoodboardLogIn", "Log In from the Guidon Tasks tab first.");
		return;
	}
	if (ProjectId.IsEmpty())
	{
		StatusText = LOCTEXT("MoodboardPickProject", "Pick a project in the Guidon Tasks tab.");
		return;
	}
	StatusText = LOCTEXT("Loading", "Loading...");

	GuidonApi::ListProjects([Weak = WeakSelf(), ThisGeneration](bool bOk, const TArray<FGuidonProject>& Projects, const FString&)
	{
		TSharedPtr<SGuidonMoodboardWidget> Self = Weak.Pin();
		if (!Self.IsValid() || Self->Generation != ThisGeneration || !bOk) return;
		for (const FGuidonProject& Project : Projects)
		{
			if (Project.Id == Self->ProjectId) Self->ProjectName = Project.Name;
		}
	});

	GuidonApi::ListReferences(ProjectId, [Weak = WeakSelf(), ThisGeneration](bool bOk, const TArray<FGuidonReference>& Loaded, const FString& Error)
	{
		TSharedPtr<SGuidonMoodboardWidget> Self = Weak.Pin();
		if (!Self.IsValid() || Self->Generation != ThisGeneration) return;
		if (!bOk)
		{
			Self->StatusText = FText::FromString(Error);
			return;
		}
		Self->References = Loaded.FilterByPredicate([](const FGuidonReference& R) { return !R.Id.IsEmpty(); });
		Self->StatusText = Self->References.Num() == 0
			? LOCTEXT("MoodboardEmpty", "No images yet - add them on the website.")
			: FText::Format(LOCTEXT("MoodboardCount", "{0} image(s)"), FText::AsNumber(Self->References.Num()));
		Self->RebuildTags();
		Self->RebuildGrid();
		Self->DownloadNext(0, ThisGeneration);
	});
}

void SGuidonMoodboardWidget::DownloadNext(int32 Index, int32 ForGeneration)
{
	if (ForGeneration != Generation || !References.IsValidIndex(Index)) return;

	const FString Id = References[Index].Id;
	GuidonApi::DownloadImage(References[Index].ImageUrl,
		[Weak = WeakSelf(), Id, Index, ForGeneration](bool bOk, const TArray<uint8>& Bytes, const FString&)
		{
			TSharedPtr<SGuidonMoodboardWidget> Self = Weak.Pin();
			if (!Self.IsValid() || Self->Generation != ForGeneration) return;

			UTexture2D* Texture = bOk ? FImageUtils::ImportBufferAsTexture2D(Bytes) : nullptr;
			if (Texture)
			{
				TSharedPtr<FLoadedImage> Loaded = MakeShared<FLoadedImage>();
				Loaded->Texture.Reset(Texture);
				Loaded->Brush = MakeShared<FSlateBrush>();
				Loaded->Brush->SetResourceObject(Texture);
				Loaded->Brush->ImageSize = FVector2D(Texture->GetSizeX(), Texture->GetSizeY());
				Loaded->Brush->DrawAs = ESlateBrushDrawType::Image;
				Self->Images.Add(Id, Loaded);
			}
			else
			{
				Self->Failed.Add(Id);
			}
			Self->RebuildGrid();
			Self->DownloadNext(Index + 1, ForGeneration);
		});
}

void SGuidonMoodboardWidget::RebuildTags()
{
	TagsBox->ClearChildren();
	TArray<FString> Tags;
	for (const FGuidonReference& Reference : References)
	{
		for (const FString& Tag : Reference.Tags) Tags.AddUnique(Tag);
	}
	if (Tags.Num() == 0) return;
	Tags.Sort();
	Tags.Insert(FString(), 0);

	for (const FString& Tag : Tags)
	{
		TagsBox->AddSlot().Padding(0.f, 0.f, 4.f, 4.f)
		[
			SNew(SButton)
			.ButtonStyle(Tag == ActiveTag ? &GuidonStyle::PrimaryButton() : &FAppStyle::Get().GetWidgetStyle<FButtonStyle>("Button"))
			.Text(Tag.IsEmpty() ? LOCTEXT("AllTags", "All") : FText::FromString(Tag))
			.OnClicked_Lambda([this, Tag]()
			{
				ActiveTag = Tag;
				RebuildTags();
				RebuildGrid();
				return FReply::Handled();
			})
		];
	}
}

bool SGuidonMoodboardWidget::Matches(const FGuidonReference& Reference) const
{
	if (!ActiveTag.IsEmpty() && !Reference.Tags.Contains(ActiveTag)) return false;
	if (Query.TrimStartAndEnd().IsEmpty()) return true;
	const FString Haystack = Reference.Caption + TEXT(" ") + Reference.Name + TEXT(" ") + FString::Join(Reference.Tags, TEXT(" "));
	return Haystack.Contains(Query.TrimStartAndEnd(), ESearchCase::IgnoreCase);
}

void SGuidonMoodboardWidget::RebuildGrid()
{
	Grid->ClearChildren();
	for (const FGuidonReference& Reference : References)
	{
		if (Matches(Reference))
		{
			Grid->AddSlot().Padding(0.f, 0.f, 8.f, 8.f)[MakeTile(Reference)];
		}
	}
}

TSharedRef<SWidget> SGuidonMoodboardWidget::MakeTile(const FGuidonReference& Reference)
{
	const TSharedPtr<FLoadedImage>* Loaded = Images.Find(Reference.Id);
	TSharedRef<SWidget> Picture = SNullWidget::NullWidget;
	if (Loaded && Loaded->IsValid())
	{
		TSharedPtr<FLoadedImage> Keep = *Loaded;
		Picture = SNew(SScaleBox).Stretch(EStretch::ScaleToFill)[SNew(SImage).Image_Lambda([Keep]() { return Keep->Brush.Get(); })];
	}
	else
	{
		Picture = SNew(SBox).HAlign(HAlign_Center).VAlign(VAlign_Center)
			[MakeText(Failed.Contains(Reference.Id) ? LOCTEXT("ImageUnavailable", "Image unavailable") : LOCTEXT("Loading", "Loading..."), 8, GuidonStyle::MutedText())];
	}

	const FGuidonReference Copy = Reference;
	return SNew(SBox)
		.WidthOverride(TileWidth)
		[
			SNew(SButton)
			.ButtonStyle(&FAppStyle::Get().GetWidgetStyle<FButtonStyle>("SimpleButton"))
			.ContentPadding(0.f)
			.ToolTipText(FText::FromString(Reference.DisplayName()))
			.OnClicked_Lambda([this, Copy]() { OpenPreview(Copy); return FReply::Handled(); })
			[
				SNew(SBorder)
				.BorderImage(GuidonStyle::CardBrush(false))
				.Padding(4.f)
				[
					SNew(SVerticalBox)
					+ SVerticalBox::Slot().AutoHeight()
					[
						SNew(SBox).HeightOverride(TileHeight).Clipping(EWidgetClipping::ClipToBounds)[Picture]
					]
					+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 4.f, 0.f, 0.f)
					[
						SNew(STextBlock)
						.Text(FText::FromString(Reference.DisplayName()))
						.Font(GuidonStyle::Font(8))
						.ColorAndOpacity(FSlateColor(GuidonStyle::Text()))
						.OverflowPolicy(ETextOverflowPolicy::Ellipsis)
					]
				]
			]
		];
}

void SGuidonMoodboardWidget::OpenPreview(const FGuidonReference& Reference)
{
	const TSharedPtr<FLoadedImage>* Found = Images.Find(Reference.Id);
	TSharedPtr<FLoadedImage> Keep = Found ? *Found : TSharedPtr<FLoadedImage>();
	const FString SourceUrl = Reference.SourceUrl;

	TSharedRef<SWindow> Window = SNew(SWindow)
		.Title(FText::FromString(Reference.DisplayName()))
		.ClientSize(FVector2D(960.f, 680.f))
		.SupportsMinimize(false);

	Window->SetContent(
		SNew(SBorder)
		.BorderImage(GuidonStyle::WindowBrush())
		.Padding(10.f)
		[
			SNew(SVerticalBox)
			+ SVerticalBox::Slot().FillHeight(1.f)
			[
				Keep.IsValid()
					? StaticCastSharedRef<SWidget>(SNew(SScaleBox).Stretch(EStretch::ScaleToFit)[SNew(SImage).Image_Lambda([Keep]() { return Keep->Brush.Get(); })])
					: StaticCastSharedRef<SWidget>(SNew(SBox).HAlign(HAlign_Center).VAlign(VAlign_Center)[MakeText(LOCTEXT("ImageUnavailable", "Image unavailable"))])
			]
			+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 8.f, 0.f, 0.f)
			[
				SNew(SHorizontalBox)
				+ SHorizontalBox::Slot().FillWidth(1.f).VAlign(VAlign_Center)
				[
					MakeText(FText::FromString(FString::Join(Reference.Tags, TEXT(", "))), 8, GuidonStyle::MutedText())
				]
				+ SHorizontalBox::Slot().AutoWidth()
				[
					SNew(SButton)
					.Visibility(SourceUrl.IsEmpty() ? EVisibility::Collapsed : EVisibility::Visible)
					.Text(LOCTEXT("OpenSource", "Open source"))
					.OnClicked_Lambda([SourceUrl]() { OpenUrl(SourceUrl); return FReply::Handled(); })
				]
			]
		]);

	FSlateApplication::Get().AddWindow(Window);
}

#undef LOCTEXT_NAMESPACE
