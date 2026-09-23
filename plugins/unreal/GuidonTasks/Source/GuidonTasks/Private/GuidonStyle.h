#pragma once

#include "CoreMinimal.h"
#include "Fonts/SlateFontInfo.h"
#include "Styling/SlateBrush.h"

/**
 * Colors copied from the web app's dark design tokens (src/app/globals.css) -
 * the same values as the Unity plugin's GuidonStyles.cs dark palette. Unreal's
 * editor is always dark, so there's no light variant.
 */
namespace GuidonStyle
{
	FLinearColor Hex(const TCHAR* Hex);

	FLinearColor WindowBackground();
	FLinearColor ColumnBackground();
	FLinearColor CardBackground();
	FLinearColor Border();
	FLinearColor Text();
	FLinearColor MutedText();
	FLinearColor Accent();
	FLinearColor Destructive();
	FLinearColor MutedBackground();

	/** Column dot colors, from BOARD_COLUMNS' accentClass (task-board.ts). */
	FLinearColor StatusColor(const FString& Status);
	FLinearColor PriorityColor(const FString& Priority);

	// Rounded brushes - statics owned by GuidonStyle, valid for the module's lifetime.
	const FSlateBrush* WindowBrush();
	const FSlateBrush* ColumnBrush(bool bHighlighted);
	const FSlateBrush* CardBrush(bool bSelected);
	const FSlateBrush* PillBrush();
	const FSlateBrush* ErrorBrush();
	const FSlateBrush* DotBrush(const FString& Status);

	FSlateFontInfo Font(int32 Size, bool bBold = false);
}
