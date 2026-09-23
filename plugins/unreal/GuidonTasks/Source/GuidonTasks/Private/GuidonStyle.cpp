#include "GuidonStyle.h"

#include "Brushes/SlateRoundedBoxBrush.h"
#include "Styling/CoreStyle.h"

FLinearColor GuidonStyle::Hex(const TCHAR* InHex)
{
	return FLinearColor(FColor::FromHex(InHex));
}

FLinearColor GuidonStyle::WindowBackground() { return Hex(TEXT("#0b0d10")); }
FLinearColor GuidonStyle::ColumnBackground() { return Hex(TEXT("#101317")); }
FLinearColor GuidonStyle::CardBackground() { return Hex(TEXT("#101317")); } // --color-card (dark)
FLinearColor GuidonStyle::Border() { return Hex(TEXT("#23272f")); }
FLinearColor GuidonStyle::Text() { return Hex(TEXT("#e8eaed")); }
FLinearColor GuidonStyle::MutedText() { return Hex(TEXT("#8b93a1")); }
FLinearColor GuidonStyle::Accent() { return Hex(TEXT("#4d8dff")); }
FLinearColor GuidonStyle::Destructive() { return Hex(TEXT("#f87171")); }
FLinearColor GuidonStyle::MutedBackground() { return Hex(TEXT("#16191f")); } // --color-muted (dark)

FLinearColor GuidonStyle::StatusColor(const FString& Status)
{
	if (Status == TEXT("todo") || Status == TEXT("ai_working")) return Hex(TEXT("#60a5fa"));
	if (Status == TEXT("in_progress")) return Hex(TEXT("#fbbf24"));
	if (Status == TEXT("review")) return Accent();
	if (Status == TEXT("done")) return Hex(TEXT("#34d399"));
	return MutedText(); // backlog
}

FLinearColor GuidonStyle::PriorityColor(const FString& Priority)
{
	if (Priority == TEXT("medium")) return Hex(TEXT("#60a5fa"));
	if (Priority == TEXT("high")) return Hex(TEXT("#fbbf24"));
	if (Priority == TEXT("critical")) return Hex(TEXT("#f87171"));
	return MutedText(); // low
}

const FSlateBrush* GuidonStyle::WindowBrush()
{
	static const FSlateRoundedBoxBrush Brush(WindowBackground(), 0.f);
	return &Brush;
}

const FSlateBrush* GuidonStyle::ColumnBrush(bool bHighlighted)
{
	// rounded-xl, like the web board's columns
	static const FSlateRoundedBoxBrush Normal(ColumnBackground(), 12.f, Border(), 1.f);
	static const FSlateRoundedBoxBrush Highlighted(ColumnBackground(), 12.f, Accent(), 1.f);
	return bHighlighted ? &Highlighted : &Normal;
}

const FSlateBrush* GuidonStyle::CardBrush(bool bSelected)
{
	// rounded-lg, like the web board's cards
	static const FSlateRoundedBoxBrush Normal(CardBackground(), 8.f, Border(), 1.f);
	static const FSlateRoundedBoxBrush Selected(CardBackground(), 8.f, Accent(), 1.f);
	return bSelected ? &Selected : &Normal;
}

const FSlateBrush* GuidonStyle::PillBrush()
{
	static const FSlateRoundedBoxBrush Brush(MutedBackground(), 4.f, Border(), 1.f);
	return &Brush;
}

const FSlateBrush* GuidonStyle::ErrorBrush()
{
	static const FSlateRoundedBoxBrush Brush(Hex(TEXT("#2a1215")), 6.f, Destructive(), 1.f);
	return &Brush;
}

const FSlateBrush* GuidonStyle::DotBrush(const FString& Status)
{
	static TMap<FString, TUniquePtr<FSlateRoundedBoxBrush>> Brushes;
	TUniquePtr<FSlateRoundedBoxBrush>& Brush = Brushes.FindOrAdd(Status);
	if (!Brush)
	{
		Brush = MakeUnique<FSlateRoundedBoxBrush>(StatusColor(Status), 4.f, FVector2D(8.f, 8.f));
	}
	return Brush.Get();
}

const FSlateBrush* GuidonStyle::PriorityDotBrush(const FString& Priority)
{
	static TMap<FString, TUniquePtr<FSlateRoundedBoxBrush>> Brushes;
	TUniquePtr<FSlateRoundedBoxBrush>& Brush = Brushes.FindOrAdd(Priority);
	if (!Brush)
	{
		Brush = MakeUnique<FSlateRoundedBoxBrush>(PriorityColor(Priority), 3.f, FVector2D(6.f, 6.f));
	}
	return Brush.Get();
}

const FSlateBrush* GuidonStyle::DividerBrush()
{
	static const FSlateRoundedBoxBrush Brush(Border(), 0.f);
	return &Brush;
}

const FButtonStyle& GuidonStyle::PrimaryButton()
{
	static const FButtonStyle Style = FButtonStyle()
		.SetNormal(FSlateRoundedBoxBrush(Accent(), 6.f))
		.SetHovered(FSlateRoundedBoxBrush(Hex(TEXT("#6ea3ff")), 6.f))
		.SetPressed(FSlateRoundedBoxBrush(Hex(TEXT("#3a76e6")), 6.f))
		.SetDisabled(FSlateRoundedBoxBrush(Border(), 6.f))
		.SetNormalForeground(Hex(TEXT("#05142e")))
		.SetHoveredForeground(Hex(TEXT("#05142e")))
		.SetPressedForeground(Hex(TEXT("#05142e")))
		.SetDisabledForeground(MutedText())
		.SetNormalPadding(FMargin(12.f, 5.f))
		.SetPressedPadding(FMargin(12.f, 6.f, 12.f, 4.f));
	return Style;
}

const FButtonStyle& GuidonStyle::DestructiveButton()
{
	static const FButtonStyle Style = FButtonStyle()
		.SetNormal(FSlateRoundedBoxBrush(WindowBackground(), 6.f, Border(), 1.f))
		.SetHovered(FSlateRoundedBoxBrush(Hex(TEXT("#2a1215")), 6.f, Destructive(), 1.f))
		.SetPressed(FSlateRoundedBoxBrush(Hex(TEXT("#2a1215")), 6.f, Destructive(), 1.f))
		.SetDisabled(FSlateRoundedBoxBrush(WindowBackground(), 6.f, Border(), 1.f))
		.SetNormalForeground(Destructive())
		.SetHoveredForeground(Destructive())
		.SetPressedForeground(Destructive())
		.SetDisabledForeground(MutedText())
		.SetNormalPadding(FMargin(12.f, 5.f))
		.SetPressedPadding(FMargin(12.f, 6.f, 12.f, 4.f));
	return Style;
}

FSlateFontInfo GuidonStyle::Font(int32 Size, bool bBold)
{
	return FCoreStyle::GetDefaultFontStyle(bBold ? "Bold" : "Regular", Size);
}
