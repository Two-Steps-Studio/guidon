#include "GuidonStyle.h"

#include "Brushes/SlateRoundedBoxBrush.h"
#include "Styling/CoreStyle.h"

FLinearColor GuidonStyle::Hex(const TCHAR* InHex)
{
	return FLinearColor(FColor::FromHex(InHex));
}

FLinearColor GuidonStyle::WindowBackground() { return Hex(TEXT("#0b0d10")); }
FLinearColor GuidonStyle::ColumnBackground() { return Hex(TEXT("#101317")); }
FLinearColor GuidonStyle::CardBackground() { return Hex(TEXT("#16191f")); }
FLinearColor GuidonStyle::Border() { return Hex(TEXT("#23272f")); }
FLinearColor GuidonStyle::Text() { return Hex(TEXT("#e8eaed")); }
FLinearColor GuidonStyle::MutedText() { return Hex(TEXT("#8b93a1")); }
FLinearColor GuidonStyle::Accent() { return Hex(TEXT("#4d8dff")); }
FLinearColor GuidonStyle::Destructive() { return Hex(TEXT("#f87171")); }
FLinearColor GuidonStyle::MutedBackground() { return Hex(TEXT("#1c1f26")); }

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
	static const FSlateRoundedBoxBrush Normal(ColumnBackground(), 8.f, Border(), 1.f);
	static const FSlateRoundedBoxBrush Highlighted(ColumnBackground(), 8.f, Accent(), 2.f);
	return bHighlighted ? &Highlighted : &Normal;
}

const FSlateBrush* GuidonStyle::CardBrush(bool bSelected)
{
	static const FSlateRoundedBoxBrush Normal(CardBackground(), 6.f, Border(), 1.f);
	static const FSlateRoundedBoxBrush Selected(CardBackground(), 6.f, Accent(), 1.f);
	return bSelected ? &Selected : &Normal;
}

const FSlateBrush* GuidonStyle::PillBrush()
{
	static const FSlateRoundedBoxBrush Brush(MutedBackground(), 9.f);
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

FSlateFontInfo GuidonStyle::Font(int32 Size, bool bBold)
{
	return FCoreStyle::GetDefaultFontStyle(bBold ? "Bold" : "Regular", Size);
}
