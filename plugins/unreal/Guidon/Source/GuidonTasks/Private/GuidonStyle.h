#pragma once

#include "CoreMinimal.h"
#include "Fonts/SlateFontInfo.h"
#include "Styling/SlateBrush.h"
#include "Styling/SlateTypes.h"

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

	/**
	 * Parses a server colour ("#rrggbb", also "rrggbb" / "#rgb"). False (and
	 * OutColor untouched) for an empty or malformed value.
	 */
	bool TryParseHex(const FString& InHex, FLinearColor& OutColor);

	/** Column dot colors for the built-in statuses, from BOARD_COLUMNS' accentClass (task-board.ts); grey for any other key. */
	FLinearColor StatusColor(const FString& Status);
	/** The project's hex colour when set, else StatusColor(Status). */
	FLinearColor StatusColor(const FString& Status, const FString& HexOverride);
	/** Built-in priority colours; grey for any other key. */
	FLinearColor PriorityColor(const FString& Priority);
	/** The project's hex colour when set, else PriorityColor(Priority). */
	FLinearColor PriorityColor(const FString& Priority, const FString& HexOverride);

	// Rounded brushes - statics owned by GuidonStyle, valid for the module's lifetime.
	const FSlateBrush* WindowBrush();
	const FSlateBrush* ColumnBrush(bool bHighlighted);
	const FSlateBrush* CardBrush(bool bSelected);
	const FSlateBrush* PillBrush();
	const FSlateBrush* ErrorBrush();
	/** Round dots, cached per colour (project colours are arbitrary hex values, so not per key). */
	const FSlateBrush* DotBrush(const FLinearColor& Color);
	const FSlateBrush* PriorityDotBrush(const FLinearColor& Color);
	const FSlateBrush* DividerBrush();

	/** The site's Button variants: solid brand blue, and the red-text outline used for Delete. */
	const FButtonStyle& PrimaryButton();
	const FButtonStyle& DestructiveButton();

	FSlateFontInfo Font(int32 Size, bool bBold = false);
}
