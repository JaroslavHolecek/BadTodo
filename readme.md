# BadTodo
Webová aplikace pro správu ToDo úkolů založená na Eisenhowerově matici

Aplikace pracuje lokálně v prohlížeči a využívá indexDb. Nesdílí žádná data a je stáhnutelná jako PWA.

## Koncept
Každý úkol má přiřazenou důležitost a naléhavost. Na základě těchto dvou hodnot jsou úkoly seřazené a je k nim vydané doporučení (začni, naplánuj, deleguj, zahoď). A to ve smyslu - nejprve důležité a naléhavé, poté důležité a méně naléhavé, poté méně důležité a naléhavé s doporučením najít si pomoc a úkol delegovat a naposled nedůležité a nenaléhavé. Vyjádření těchto 4 možností je u každého úkolu v procentech.

## Principy kódu
Aplikace je konstruovaná prinicipem "composition over inheritance" a "let data by just data", ve kterých nejsou data nijak skryta je odpovědností jednotlivých funkcí, aby je nerozbila a také si zkontrolovat, zda jsou data ve stavu, se kterým dokáže funkce pracovat.
Jsou důsledně oddělené HTML, CSS, JS a další soubory a také jednotlivé moduly zajišťující specifické operace.
Třídy, proměnné a funkce jsou pojmenované v angličtině a řádně okomentované docstringy.

## Struktura aplikace
### Základní struktura
Data aplikace jsou uložená v objektu AppData, který obsahuje veškeré nastavení, možnosti jeho importu, exportu a všechny datové součásti aplikace.
Dále je zde objekt AppGUI ve kterém jsou funkce pro vykreslení datové aplikace do stránky.

Nejvyšší data jsou "Context", ve kterém jsou jednotlivé "Task" a každý tento "Task" může obsahovat své vnitřní "Task" - struktura je tedy rekurzivní. Těchto Contextů si může uživatel vytvořit více.

Každý Task má:
 - název
 - krátký popisek
 - dlouhý popisek
 - hodnotu splnění od 0 do 100
 - důležitost
 - naléhavost
 - seznam subTasků (může být prázdný)

Hodnoty pro důležitost a naléhavost jsou mezi 0 a 100:
- Buď konstantní jako jedno číslo,
- nebo ve formě prvního a posledního dne a logistické funkce mezi nimi, která vyjadřuje změnu důležitosti a naléhavosti v průběhu času mezi zadanými dny. Před a po prvním respektive posledním dnu je hodnota konstantní na odpovídající zadané hodnotě.
    {
        startDate: "2026-05-01",
        startValue: 20,
        endDate: "2026-06-01",
        endValue: 80,
        steepness: 12,
        midpoint: 0.5
    }

    function sigmoid(z) {
        return 1 / (1 + Math.exp(-z));
    }

    function transition(t, k, m = 0.5) {
        // Pro velmi malé k se logistika chová skoro lineárně.
        // Tím se vyhneme numerickým problémům.
        if (Math.abs(k) < 0.0001) {
            return t;
        }

        const a = sigmoid(k * (0 - m));
        const b = sigmoid(k * (1 - m));
        const value = sigmoid(k * (t - m));

        return (value - a) / (b - a);
    }

Context má:
 - název
 - popisek
 - seznam Tasků
Context lze exportovat do JSON souboru a také ho do aplikace z JSON souboru importovat.

Nastavení ToDo seznamu
    Pro vyhodnocení pořadí Tasků se započítává hodnota naléhavosti a důslednosti, jako jejich kombinace skóre = K*naléhavost + (1-K)*důležitost. Tuto hodnotu K lze nastavit v rozsahu zachování smyslu Eisenhowerovy matice (tedy, že důležitost má vždy vyšší váhu, než naléhavost)

### Zadávání hodnot
Při nastavování hodnot důležitosti (a stejně tak naléhavosti):
- Uživatel si může přepnout mezi zadáváním konstantní hodnoty (pak je to jednoduše jedno číslo) a měnící se hodnoty (pak jsou ).
- U měnící se hodnoty je důležitost uložena jako první a druhý den a jejich hodnoty a parametry normalizované logistické funkce mezi nimi.
    Uživatel zadá jeden den a hodnotu důležitosti v tomto dnu. Dále druhý den a hodnotu v tomto dnu. Zobrazí se graf. Na tyto body lze kliknout a v modálním okně změnit jejich hodnoty a dny. Mezi nimi je normalizovaná logistická funkce a v inflexním bodu této logistické funkci je posuvník (bod, kterým lze posouvat ve čtyřech směrech), kterým lze manipulovat se strmostí funkce (nahoru a dolů) a dnem (doleva a doprava). Posuvníkem lze pohybovat maximálně do míst, dokud lze dodržet původní dva zadané body.

Při vytváření Contextu uživatel zadá povinně název a volitelně popisek. Aplikace si pamatuje poslední použitý Context a automaticky ho zobrazuje, dokud uživatel aktivně nepřepne na jiný.

Při vytváření Tasku je povinný název. Povinné jsou také hodnoty splnění a důležitost a naléhavost - ty jsou defaultně předvyplněné (splnění na 0, důležitost a naléhavost jako konstantní 50) zbytek je plně volitelný. SubTasky se doplňují až po vytvoření Tasku při zobrazení jeho detailů

### Zobrazení aplikace
#### Menu
- V menu je možné přejít na stránku se seznamem existujících Contextů a možností vytvořit nový Context
- Přejít na úvodní stránku
- Přejít na stránku s nastavením
- Přejít na stránku s informacemi o aplikaci

#### Úvodní stránka
Na stránce je zobrazen název aktuálního Contextu (po kliknutí na název se zobrazí oddíl s popiskem)
Dále seznam Tasků seřazených dle vyhodnocené hodnoty. SubTasky se zobrazují jako podskupina konkrétního Tasku, kterou lze zobrazit nebo skrýt. Je možností rozkliku detailu jednotlivých Tasků či SubTasků. U Tasku je vidět název, hodnota splnění, vyhodnocená hodnota a čtyřbarevná čára zobrazující vyhodnocení pro "pustit se do toho - naplánovat - delegovat - nic". Po rozkliku detailu je vidět krátký popisek a případné SubTasky. Po dalším detailu se již otevře nová stránka s úplným detailem a možností nastavení úkolu.
Je zde tlačítko pro vytvoření nového úkolu.

#### Stránka úkolu
Na stránce úkolu jsou veškeré informace o úkolu a možnost přenastavení všech hodnot včetně důležitosti a naléhavosti.
Také je zde tlačítko pro přidání podúkolu - tedy úkolu s předvyplněným nadúkolem.

#### Stránka s nastavením
Umožňuje nastavit parametry aplikace:
    Váhu mezi důležitostí a naléhavostí
    Defaultní hodnoty v novém úkolu

#### Stránka kontextů
Umožňuje přepnout do jiného kontextu a vytvořit nový kontext.

#### Informace o aplikaci
Obsahuje popis použití.
Odkaz pro stažení jako PWA
Odkaz na GitHub, informace pro dárce
Informace o licenci a o autorovi

