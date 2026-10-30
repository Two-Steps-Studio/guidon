# Jak zmienić grafikę podglądu linku Guidona

Grafika pokazywana po wklejeniu linku np. na Discordzie to **Open Graph image**.
Nie jest to profilowe ani baner w `public/brand/social/`.

Obecnie źródłem jest **`src/app/opengraph-image.tsx`**. Next.js generuje z tego
komponentu PNG o wymiarach **1200 × 630** i automatycznie dodaje adres grafiki
do metadanych strony. Tekst, kolory i układ można zmienić w tym pliku.

Jeżeli chcesz użyć własnej gotowej grafiki:

1. Wyeksportuj PNG 1200 × 630, najlepiej poniżej 5 MB, żeby pasował też do
   limitu Twitter/X. Trzymaj logo i tekst z dala od krawędzi.
2. Usuń generator `src/app/opengraph-image.tsx` i dodaj obraz jako
   **`src/app/opengraph-image.png`**. W repo powinien pozostać jeden wariant,
   żeby nie tworzyć konfliktu konwencji metadanych Next.js.
3. Zastąp tekst alternatywny z generatora plikiem
   **`src/app/opengraph-image.alt.txt`**, opisującym nową grafikę.
4. Uruchom `npm run build`. W podglądzie wdrożenia sprawdź `og:image` oraz
   `twitter:image` w kodzie strony, otwórz wskazany obraz i sprawdź kadrowanie.
   Dopiero potem wdrażaj zmianę na produkcję.

Nie trzeba zmieniać `src/app/layout.tsx`: korzysta z konwencji plikowej Next.js.
Nie zmieniaj `twitter.card` z `summary_large_image` na małą kartę.

Discord i inne serwisy mogą pamiętać poprzedni podgląd. Stara wiadomość nie
potwierdza, że wdrożenie się nie udało. Najpierw sprawdź aktualne metadane i
obraz, a następnie nową wiadomość. Link z nowym parametrem (np.
`https://useguidon.com/?preview=2`) może pomóc odróżnić nowy odczyt, ale odświeżenie
pamięci podręcznej zależy od serwisu.

Do tego zadania nie podmieniono grafiki za właściciela. Obecny generator zostaje,
aż będzie gotowy wybrany przez niego projekt. Oficjalne pliki i kolory są
opisane w `docs/brand-kit.md` oraz na stronie `/brand`.
