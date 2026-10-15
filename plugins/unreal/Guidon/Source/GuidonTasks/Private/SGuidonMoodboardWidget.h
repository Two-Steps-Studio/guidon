#pragma once

#include "CoreMinimal.h"
#include "GuidonModels.h"
#include "UObject/StrongObjectPtr.h"
#include "Widgets/DeclarativeSyntaxSupport.h"
#include "Widgets/SCompoundWidget.h"

class SWrapBox;
class UTexture2D;
struct FSlateBrush;

/**
 * The "Guidon Moodboard" tab: the project picked in the Guidon Tasks tab
 * (FGuidonSettings::GetProjectId) shown as a grid of its reference images.
 * Images are decoded into transient textures held only by this widget.
 */
class SGuidonMoodboardWidget : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SGuidonMoodboardWidget) {}
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);

private:
	struct FLoadedImage
	{
		TStrongObjectPtr<UTexture2D> Texture;
		TSharedPtr<FSlateBrush> Brush;
	};

	void Reload();
	void DownloadNext(int32 Index, int32 Generation);
	void RebuildTags();
	void RebuildGrid();
	bool Matches(const FGuidonReference& Reference) const;
	TSharedRef<SWidget> MakeTile(const FGuidonReference& Reference);
	void OpenPreview(const FGuidonReference& Reference);
	TWeakPtr<SGuidonMoodboardWidget> WeakSelf();

	FString ProjectId;
	FString ProjectName;
	FText StatusText;
	FString Query;
	FString ActiveTag;
	int32 Generation = 0;
	TArray<FGuidonReference> References;
	// Shared so a tile or an open preview window keeps its brush alive across a Reload.
	TMap<FString, TSharedPtr<FLoadedImage>> Images;
	TSet<FString> Failed;

	TSharedPtr<SWrapBox> TagsBox;
	TSharedPtr<SWrapBox> Grid;
};
