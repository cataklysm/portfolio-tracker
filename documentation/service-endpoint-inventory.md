# Service-Endpunkte und Zuständigkeitsprüfung

Stand: 2026-06-15

## Zweck und Bewertungsmaßstab

Dieses Dokument inventarisiert die aktuell registrierten HTTP-Endpunkte aller
Backend-Services und bewertet, ob sie im fachlich richtigen Service liegen.
Grundlage sind die tatsächlich registrierten Fastify-Routen, die Gateway-
Routingtabelle, interne HTTP-Clients, Datenbankschemas und der in
`documentation/prompt.md` definierte Service-Schnitt.

Bewertung:

- **Passend**: Endpunkt und Persistenz gehören zum definierten Bounded Context.
- **Vertretbar**: Die Zuordnung ist nicht zwingend, bleibt aber kohärent und
  erzeugt aktuell keine problematische Kopplung.
- **Prüfen**: Die Zuordnung weicht vom definierten Service-Schnitt ab oder
  verteilt eine Fachdomäne über mehrere Services.
- **Verschieben**: Es liegt eine klare Grenzverletzung oder fachliche
  Vermischung vor.

Alle Services registrieren zusätzlich die folgenden operativen Endpunkte:

| Methode | Pfad | Zweck | Exposition |
|---|---|---|---|
| `GET` | `/health/live` | Prozess-Liveness | direkt am Service |
| `GET` | `/health/startup` | Startup-Prüfung | direkt am Service |
| `GET` | `/health/ready` | Readiness inklusive Pflichtabhängigkeiten | direkt am Service |
| `GET` | `/metrics` | Prometheus-Metriken | direkt am Service |

Diese Endpunkte liegen korrekt in der gemeinsamen Plattform-Infrastruktur. Das
Gateway routet die operativen Endpunkte der Upstream-Services nicht weiter,
stellt seine eigenen Endpunkte aber selbst bereit.

## Gesamturteil

Der fachliche Schnitt ist überwiegend nachvollziehbar. Besonders sauber sind
die Trennungen zwischen Instrument-Stammdaten, Marktdaten, Fundamentals,
objektiven Events, nutzereigenen Insights und angewendeten Corporate Actions im
Portfolio.

Es bestehen jedoch zwei klare Grenzverletzungen:

1. **`instruments` besitzt eine fachfremde Refresh-Interest-/Watch-Projektion.**
   Der Service konsumiert Portfolio-Interessen, persistiert
   `instruments.watch_interests`, publiziert `instruments.watch.*` und stellt
   `/internal/watch-set` bereit. Laut definiertem Service-Schnitt gehört die
   konsolidierte Refresh-Interest-Projektion zu `market`, nicht zu den
   Instrument-Stammdaten.
2. **`instruments` liest direkt aus `portfolio.positions` und
   `portfolio.watchlist_items`.** Das geschieht für die Admin-Symbolansicht und
   beim Deaktivieren eines Listings. Damit ist die Vorgabe verletzt, Services
   so zu bauen, als lägen ihre Datenbanken physisch getrennt.

Weitere relevante Vermischungen:

- **Portfolio-Fachpräferenzen liegen in `authentication`:**
  `reporting_currency` und insbesondere
  `realization_accounting_method` steuern Portfolio-Berechnungen, werden aber
  über `/me/preferences` im Authentication-Service geschrieben und vom
  Portfolio-Service synchron gelesen. Der definierte Service-Schnitt ordnet
  Portfolio-Präferenzen `portfolio` zu.
- **Die Steuerdomäne ist bewusst nach Geltungsbereich geteilt:** Die
  nutzerbezogene, effektiv datierte Steuerresidenz liegt in `authentication`;
  Berechnungsregeln, nutzerweite Berechnungsparameter, Portfolio-Overrides,
  Steuerereignisse und Berechnung liegen in `portfolio`. Dieser Schnitt ist
  vertretbar. Klärungsbedarf besteht aber, weil Steuerresidenz und User-
  Steuereinstellungen jeweils ein Land speichern und dadurch zwei potenzielle
  Wahrheiten entstehen.
- **Analystenbewertungen werden fachfremd in `market` erzeugt:** `market`
  ruft den Provider auf und publiziert `market.analyst_assessment.updated`,
  während `insights` die Datensätze besitzt. Die Providerbeschaffung kann
  zentral bleiben, die Refresh-Orchestrierung und das fachliche Event sollten
  aber `insights` gehören.
- **Schreibende Refresh-Endpunkte verwenden Leserechte:** `/quotes/refresh`,
  `/fx/refresh`, `/fundamentals/refresh` und `/events/refresh` verändern
  persistierte Daten, verlangen aber nur den jeweiligen Read-Scope. Das ist
  keine Service-Grenzverletzung, aber eine inkonsistente Berechtigungsgrenze.

## Gateway

Das Gateway enthält keine Fachlogik und ist korrekt auf Routing,
Edge-Authentifizierung, CORS, Security Header und Rate Limiting beschränkt.

| Öffentlicher Prefix | Zielservice | Gateway-Authentifizierung | Bewertung |
|---|---|---|---|
| `/auth` | authentication | nein | Passend |
| `/.well-known` | authentication | nein | Passend |
| `/me` | authentication | Bearer | Passend, mit Präferenz-Ausnahme |
| `/tax-residency` | authentication | Bearer | Vertretbar: nutzerbezogenes Profilmerkmal |
| `/portfolios`, `/positions`, `/reporting` | portfolio | Bearer | Passend |
| `/tax-events`, `/tax-rules`, `/tax-settings` | portfolio | Bearer | Passend innerhalb einer Portfolio-Steuerdomäne |
| `/changes`, `/activity`, `/corporate-actions`, `/watchlist` | portfolio | Bearer | Passend |
| `/instruments`, `/exchanges`, `/listings` | instruments | Bearer | Passend |
| `/quotes`, `/fx` | market | Bearer | Passend |
| `/fair-values`, `/price-targets` | insights | Bearer | Passend |
| `/fundamentals` | fundamentals | Bearer | Passend |
| `/events` | events | Bearer | Passend |
| `/notifications` | notifications | Bearer | Passend |

Die Gateway-Routingtabelle ist vollständiger als `services/gateway/README.md`;
das README ist veraltet und nennt mehrere inzwischen exponierte Prefixe nicht.

## Authentication-Service

Sollzuständigkeit: Token-Autorität, Login-Verfahren, Sessions, Setup und
Benutzerverwaltung.

| Methode | Pfad | Auth/Scope | Bewertung |
|---|---|---|---|
| `POST` | `/auth/setup` | Setup-Secret | Passend |
| `POST` | `/auth/login` | öffentlich | Passend |
| `POST` | `/auth/refresh` | öffentlich | Passend |
| `POST` | `/auth/logout` | öffentlich | Passend |
| `POST` | `/auth/token` | Personal Access Token | Passend |
| `GET` | `/.well-known/jwks.json` | öffentlich | Passend |
| `GET` | `/me` | `profile:read` | Passend für Identität; Antwort enthält fachfremde Portfolio-Präferenzen |
| `PATCH` | `/me/preferences` | `profile:write` | Prüfen: gemischte UI-, Locale- und Portfolio-Präferenzen |
| `GET` | `/me/api-tokens` | interaktive Session | Passend |
| `GET` | `/me/api-tokens/scopes` | interaktive Session | Passend |
| `POST` | `/me/api-tokens` | interaktive Session | Passend |
| `DELETE` | `/me/api-tokens/:id` | interaktive Session | Passend |
| `GET` | `/tax-residency` | `profile:read` | Vertretbar: nutzerbezogene, effektiv datierte Residenz |
| `POST` | `/tax-residency` | `profile:write` | Vertretbar: nutzerbezogene, effektiv datierte Residenz |

Empfehlung:

- Identitätsnahe Felder wie Anzeigename, Avatar, Locale und Zeitzone in
  `authentication` belassen.
- `reporting_currency`, `realization_accounting_method`, Benchmark- und
  Headline-Einstellungen in `portfolio` verschieben.
- Steuerresidenz kann in `authentication` bleiben. Der Vertrag muss aber
  festlegen, dass sie die autoritative Quelle für das steuerliche Land ist.
  `portfolio.user_tax_settings.country_code` sollte daraus abgeleitet, als
  expliziter historischer Snapshot definiert oder entfernt werden.

## Portfolio-Service

Sollzuständigkeit: Portfolios, Positionen, Transaktionen, Transfers,
Realisierungsrechnung, Cashflows, angewendete Corporate Actions,
Portfolio-Präferenzen und Watchlists.

### Portfolios, Positionen und Buchungen

| Methode | Pfad | Scope | Bewertung |
|---|---|---|---|
| `GET` | `/portfolios` | `portfolio:read` | Passend |
| `POST` | `/portfolios` | `portfolio:write` | Passend |
| `POST` | `/portfolios/:id/archive` | `portfolio:write` | Passend |
| `POST` | `/portfolios/:id/unarchive` | `portfolio:write` | Passend |
| `DELETE` | `/portfolios/:id` | `portfolio:write` | Passend |
| `PATCH` | `/portfolios/order` | `portfolio:write` | Passend |
| `PUT` | `/portfolios/:id/benchmark` | `portfolio:write` | Passend |
| `GET` | `/positions` | `portfolio:read` | Passend |
| `GET` | `/positions/:id` | `portfolio:read` | Passend |
| `POST` | `/positions` | `portfolio:write` | Passend |
| `DELETE` | `/positions/:id` | `portfolio:write` | Passend |
| `GET` | `/positions/:id/allocations` | `portfolio:read` | Passend |
| `GET` | `/positions/:id/transfers` | `portfolio:read` | Passend |
| `POST` | `/positions/:id/transfer` | `portfolio:write` | Passend |
| `POST` | `/positions/:id/transfer-lots` | `portfolio:write` | Passend: Teiltransfer offener Lots in dieselbe Listing-Position |
| `POST` | `/positions/:id/transactions` | `portfolio:write` | Passend |
| `PATCH` | `/positions/:id/transactions/:txId` | `portfolio:write` | Passend |
| `DELETE` | `/positions/:id/transactions/:txId` | `portfolio:write` | Passend |
| `GET` | `/portfolios/:portfolioId/cash-flows` | `portfolio:read` | Passend |
| `POST` | `/portfolios/:portfolioId/cash-flows` | `portfolio:write` | Passend |
| `PATCH` | `/portfolios/:portfolioId/cash-flows/:id` | `portfolio:write` | Passend |
| `DELETE` | `/portfolios/:portfolioId/cash-flows/:id` | `portfolio:write` | Passend |

### Reporting, Audit und Activity

| Methode | Pfad | Scope | Bewertung |
|---|---|---|---|
| `GET` | `/reporting/summary` | `portfolio:read` | Passend |
| `GET` | `/reporting/holdings` | `portfolio:read` | Passend |
| `GET` | `/reporting/allocation` | `portfolio:read` | Passend |
| `GET` | `/reporting/tax` | `portfolio:read` | Passend |
| `GET` | `/reporting/snapshot` | `portfolio:read` | Passend |
| `GET` | `/reporting/performance` | `portfolio:read` | Passend |
| `GET` | `/reporting/risk` | `portfolio:read` | Passend |
| `GET` | `/reporting/benchmark` | `portfolio:read` | Passend |
| `GET` | `/changes` | `portfolio:read` | Passend: technischer Audit-Log der Buchungen |
| `GET` | `/activity` | `portfolio:read` | Passend: fachlicher Aktivitätsstrom |

`/changes` und `/activity` wirken ähnlich, haben aber unterschiedliche Zwecke:
`changes` ist der unveränderliche Audit-Trail, `activity` eine zusammengeführte
fachliche Sicht. Die Trennung ist sinnvoll.

### Corporate Actions, Watchlist und interne API

| Methode | Pfad | Scope/Exposition | Bewertung |
|---|---|---|---|
| `GET` | `/positions/:id/corporate-actions` | `portfolio:read` | Passend: angewendete Aktionen |
| `POST` | `/positions/:id/corporate-actions` | `portfolio:write` | Passend |
| `POST` | `/corporate-actions/:applicationId/reverse` | `portfolio:write` | Passend |
| `GET` | `/watchlist` | `portfolio:read` | Passend |
| `POST` | `/watchlist` | `portfolio:write` | Passend |
| `DELETE` | `/watchlist/:listingId` | `portfolio:write` | Passend |
| `GET` | `/internal/positions` | intern, ohne Token | Passend als internes Read Model; Service-Auth fehlt |

Die Trennung ist korrekt: `events` besitzt objektive Corporate-Action-Fakten,
`portfolio` besitzt nur die vom Benutzer auf den Ledger angewendeten Aktionen.

### Steuerdomäne

| Methode | Pfad | Scope | Bewertung |
|---|---|---|---|
| `GET` | `/tax-events` | `portfolio:read` | Passend: tatsächlich gebuchte Steuerereignisse |
| `POST` | `/tax-events` | `portfolio:write` | Passend |
| `PATCH` | `/tax-events/:id` | `portfolio:write` | Passend |
| `DELETE` | `/tax-events/:id` | `portfolio:write` | Passend |
| `GET` | `/tax-rules` | `portfolio:read` | Vertretbar; globale Referenzdaten innerhalb der Portfolio-Steuerdomäne |
| `GET` | `/tax-settings` | `portfolio:read` | Passend: nutzerweite Parameter für Portfolio-Steuerberechnungen |
| `PUT` | `/tax-settings` | `portfolio:write` | Passend, sofern das Land aus der autoritativen Residenz folgt |
| `GET` | `/portfolios/:id/tax-settings` | `portfolio:read` | Passend |
| `PUT` | `/portfolios/:id/tax-settings` | `portfolio:write` | Passend |
| `GET` | `/reporting/tax/estimate` | `portfolio:read` | Passend |

Die Aufteilung nach Geltungsbereich ist schlüssig: `authentication` besitzt die
nutzerspezifische Identitäts-/Residenzinformation, `portfolio` besitzt
portfolioabhängige Einstellungen, Buchungen und Berechnungen sowie die dafür
benötigten nutzerweiten Berechnungsparameter. Wichtig ist ein klarer Vertrag:
Die Steuerresidenz ist autoritativ, während User-Steuereinstellungen keine
zweite unabhängige Residenz definieren. Wenn Regelkatalog und Berechnungslogik
stark wachsen oder unabhängig versioniert werden müssen, ist ein eigener
`tax`-Service der nächste sinnvolle Schnitt.

## Instruments-Service

Sollzuständigkeit: globale Instrumente, Listings, Börsen/MICs und
Provider-Identifier.

| Methode | Pfad | Scope/Exposition | Bewertung |
|---|---|---|---|
| `GET` | `/exchanges` | `instruments:read` | Passend |
| `POST` | `/exchanges` | `instruments:write` | Passend |
| `GET` | `/instruments/search` | `instruments:read` | Passend, sucht aktuell nur lokal |
| `GET` | `/instruments/:id` | `instruments:read` | Passend |
| `PATCH` | `/instruments/:id` | `instruments:write` | Passend |
| `POST` | `/instruments` | `instruments:write` | Passend |
| `GET` | `/instruments/admin/symbols` | `system:admin` | Endpunkt passend, Implementierung verletzt Grenze |
| `DELETE` | `/instruments/admin/symbols/:id` | `system:admin` | Endpunkt passend, Implementierung verletzt Grenze |
| `GET` | `/listings` | `instruments:read` | Passend |
| `GET` | `/listings/sessions` | `instruments:read` | Passend: Session folgt aus Börsen-Stammdaten |
| `GET` | `/listings/:id` | `instruments:read` | Passend |
| `PATCH` | `/listings/:id` | `instruments:write` | Passend |
| `GET` | `/internal/listings/resolve` | intern, ohne Token | Passend; Service-Auth fehlt |
| `GET` | `/internal/watch-set` | intern, ohne Token | Verschieben |

Klare Grenzverletzung:

- `KyselyCatalogRepository.listAdminSymbols()` und `listingInUse()` lesen direkt
  aus `portfolio.positions` und `portfolio.watchlist_items`.
- `InstrumentsDatabase` deklariert diese fremden Tabellen explizit als
  Read-Referenzen.

Zielbild:

- Die In-Use-Information über ein internes Portfolio-Read-API oder eine
  eventbasierte, instruments-eigene Referenzprojektion beziehen.
- Das Deaktivieren eines Listings anhand eines stabilen, lokalen
  Referenzstatus entscheiden; keine direkte Portfolio-Abfrage.
- `watch_interests`, den Portfolio-Interest-Consumer, `instruments.watch.*` und
  `/internal/watch-set` nach `market` verschieben. Alternativ einen expliziten
  gemeinsamen `refresh-interests`-Service einführen, falls Market,
  Fundamentals und Events unabhängig dieselbe Projektion benötigen.

Die spezifizierte Discovery-Kette ist zudem unvollständig: Der interne
Market-Endpunkt `/internal/discovery/search` existiert, wird von `instruments`
aber nicht aufgerufen. `/instruments/search` liefert nur lokale Treffer.

## Market-Service

Sollzuständigkeit: Quotes, offizielle FX-Raten, Refresh-Interest-Projektion,
Refresh-Scheduler und Providerzugriff für Marktdaten.

| Methode | Pfad | Scope/Exposition | Bewertung |
|---|---|---|---|
| `GET` | `/quotes` | `market:read` | Passend |
| `GET` | `/quotes/:listingId/series` | `market:read` | Passend |
| `GET` | `/quotes/:listingId/history` | `market:read` | Passend |
| `POST` | `/quotes/refresh` | `market:read` | Service passend, Scope prüfen |
| `GET` | `/fx/rates` | `market:read` | Passend |
| `GET` | `/fx/rate` | `market:read` | Passend |
| `GET` | `/fx/series` | `market:read` | Passend |
| `POST` | `/fx/refresh` | `market:read` | Service passend, Scope prüfen |
| `GET` | `/internal/quotes` | intern, ohne Token | Passend; Service-Auth fehlt |
| `POST` | `/internal/quotes/refresh` | intern, ohne Token | Passend; Service-Auth fehlt |
| `POST` | `/internal/fx/refresh` | intern, ohne Token | Passend; Service-Auth fehlt |
| `GET` | `/internal/discovery/search` | intern, ohne Token | Passend, derzeit ungenutzt |

Der Service enthält außerdem ohne eigenen HTTP-Endpunkt ein `analyst`-Modul,
das Analystenbewertungen vom Providers-Service lädt und ein Market-Event für
`insights` publiziert. Analystenbewertungen sind laut Service-Schnitt
`insights`-Daten. Diese Orchestrierung sollte nach `insights` verschoben werden;
`market` sollte keine fachlichen Analysten-Events produzieren.

Umgekehrt fehlt dem Market-Service die laut Spezifikation ihm zugeordnete
persistierte Refresh-Interest-Projektion. Diese liegt aktuell in `instruments`.

## Fundamentals-Service

Sollzuständigkeit: objektive Unternehmens- und Finanzkennzahlen.

| Methode | Pfad | Scope | Bewertung |
|---|---|---|---|
| `GET` | `/fundamentals` | `fundamentals:read` | Passend |
| `POST` | `/fundamentals/refresh` | `fundamentals:read` | Service passend, Scope prüfen |

Der Service besitzt seine Snapshots und Refresh-Logik sauber. Die Abhängigkeit
vom gemeinsamen Watch-Set ist fachlich sinnvoll; nur dessen aktuelle
Eigentümerschaft bei `instruments` ist falsch.

## Events-Service

Sollzuständigkeit: objektive Earnings, Corporate Actions, News und
Kalenderereignisse.

| Methode | Pfad | Scope/Exposition | Bewertung |
|---|---|---|---|
| `GET` | `/events/earnings` | `events:read` | Passend |
| `GET` | `/events/corporate-actions` | `events:read` | Passend |
| `GET` | `/events/news` | `events:read` | Passend |
| `POST` | `/events/refresh` | `events:read` | Service passend, Scope prüfen |
| `GET` | `/internal/earnings` | intern, ohne Token | Passend; Service-Auth fehlt |

Die objektiven Corporate-Action-Fakten sind korrekt von den angewendeten
Portfolio-Corporate-Actions getrennt. Ein Macro-Calendar ist laut Service-
Schnitt vorgesehen, hat aber noch keinen Endpunkt.

## Insights-Service

Sollzuständigkeit: Fair-Value-Modelle, Analystenschätzungen, eigene Zielzonen
und weitere subjektive/analytische Einschätzungen.

| Methode | Pfad | Scope/Exposition | Bewertung |
|---|---|---|---|
| `GET` | `/fair-values` | `insights:read` | Passend |
| `POST` | `/fair-values` | `insights:write` | Passend |
| `DELETE` | `/fair-values/:id` | `insights:write` | Passend |
| `GET` | `/price-targets` | `insights:read` | Passend |
| `POST` | `/price-targets` | `insights:write` | Passend |
| `PATCH` | `/price-targets/:id` | `insights:write` | Passend |
| `DELETE` | `/price-targets/:id` | `insights:write` | Passend |
| `GET` | `/internal/price-targets` | intern, ohne Token | Passend; Service-Auth fehlt |

Die öffentliche API liegt korrekt. Verschoben werden sollte lediglich die
Erzeugung der globalen Analystenbewertungen aus dem `market`-Service in diesen
Service.

## Notifications-Service

Sollzuständigkeit: Inbox, Alert-Regeln und Alert-Auswertung.

| Methode | Pfad | Scope | Bewertung |
|---|---|---|---|
| `GET` | `/notifications` | `notifications:read` | Passend |
| `POST` | `/notifications/:id/read` | `notifications:read` | Service passend, Scope prüfen |
| `POST` | `/notifications/read-all` | `notifications:read` | Service passend, Scope prüfen |
| `GET` | `/notifications/rules` | `notifications:read` | Passend |
| `POST` | `/notifications/rules` | `notifications:write` | Passend |
| `PATCH` | `/notifications/rules/:id` | `notifications:write` | Passend |
| `DELETE` | `/notifications/rules/:id` | `notifications:write` | Passend |

Die fachliche Bündelung ist korrekt. Der Service komponiert für die
Alert-Auswertung interne Reads aus Instruments, Market, Events, Insights und
Portfolio. Das ist für einen Alert-Evaluator angemessen. Die internen
Upstream-Endpunkte sind jedoch nur netzwerkbeschränkt und noch nicht durch
Service-Tokens geschützt.

## Providers-Service

Aktuelle Zuständigkeit: stateless, zentraler Egress und Normalisierungsschicht
zu externen Datenprovidern.

| Methode | Pfad | Exposition | Bewertung |
|---|---|---|---|
| `GET` | `/internal/capabilities` | intern, ohne Token | Passend für zentralen Provider-Egress |
| `POST` | `/internal/quotes` | intern, ohne Token | Passend |
| `GET` | `/internal/chart` | intern, ohne Token | Passend |
| `GET` | `/internal/search` | intern, ohne Token | Passend |
| `GET` | `/internal/analyst` | intern, ohne Token | Passend als Provideradapter |
| `GET` | `/internal/fundamentals` | intern, ohne Token | Passend |
| `GET` | `/internal/fx/rates` | intern, ohne Token | Passend |
| `GET` | `/internal/earnings` | intern, ohne Token | Passend |
| `GET` | `/internal/corporate-actions` | intern, ohne Token | Passend |
| `GET` | `/internal/news` | intern, ohne Token | Passend |

Der Providers-Service ist intern kohärent, fehlt aber im definierten
Service-Schnitt. Aktuell widersprechen sich zwei Architekturmodelle:

- Spezifikation und ältere Service-READMEs sagen, dass insbesondere `market`
  Yahoo/ECB und die Provideradapter besitzt.
- Die Implementierung zentralisiert sämtliche externen Providerzugriffe in
  `providers`.

Beide Modelle sind möglich. Die aktuelle Implementierung sollte ausdrücklich
als Architekturentscheidung dokumentiert werden. Bei Beibehaltung ist
`providers` ausschließlich eine technische Anti-Corruption-/Egress-Schicht;
fachliche Persistenz, Refresh-Entscheidungen und Domain-Events müssen weiterhin
im jeweils zuständigen Service bleiben.

## Empfohlene Maßnahmen

### Priorität 1: echte Grenzverletzungen entfernen

1. Direkte `portfolio.*`-Reads aus `instruments` entfernen.
2. `instruments.watch_interests`, Watch-Consumer, Watch-Outbox-Events und
   `/internal/watch-set` nach `market` oder in einen expliziten
   Refresh-Interest-Service verschieben.
3. Interne Endpunkte mit Service-Authentifizierung absichern; reine
   Gateway-Nichterreichbarkeit ist keine vollständige Vertrauensgrenze.

### Priorität 2: fachliche Eigentümerschaft konsolidieren

1. Portfolio-relevante Präferenzen aus `authentication` nach `portfolio`
   verschieben.
2. Die Steuerresidenz als autoritative Quelle für das steuerliche Land
   festlegen und die Semantik von `portfolio.user_tax_settings.country_code`
   entsprechend ableiten, als Snapshot dokumentieren oder entfernen.
3. Analysten-Refresh und das entsprechende Domain-Event nach `insights`
   verschieben.
4. Entscheiden und dokumentieren, ob `providers` der verbindliche zentrale
   Egress-Service ist.

### Priorität 3: Verträge und Dokumentation angleichen

1. Schreibende Refresh- und Read-State-Endpunkte mit passenden Write- oder
   Action-Scopes versehen.
2. Die spezifizierte Discovery-Kette
   `frontend -> instruments -> market -> providers` implementieren oder den
   ungenutzten Market-Discovery-Endpunkt entfernen.
3. Service-READMEs und Gateway-README aus den tatsächlichen Routen aktualisieren.
4. Für die Endpunkte maschinenlesbare OpenAPI-Verträge generieren, damit diese
   Inventur künftig automatisiert auf Drift geprüft werden kann.
