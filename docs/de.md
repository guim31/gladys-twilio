# Twilio

Sende **SMS** und tätige **Sprachanrufe** aus deinen Gladys-Szenen über dein
eigenes [Twilio](https://www.twilio.com)-Konto: eine SMS an die Familie, wenn
der Wassermelder auslöst, ein Anruf, der den Alarm laut vorliest, wenn niemand
aufs Handy schaut, ein Anruf beim Nachbarn, wenn ein älterer Angehöriger nicht
abnimmt. Nützlich, wo eine App-Benachrichtigung nicht reicht oder kein mobiles
Internet da ist.

Diese Integration ist nicht mit Twilio verbunden. Twilio berechnet jede SMS und
jeden Anruf deinem Konto: Ein **Kostenschutz** begrenzt, was Gladys pro Stunde
und pro Tag senden darf.

> **Ohne die Hardware entwickelt: Rückmeldungen willkommen** (_Developed without
> the hardware: feedback welcome_). Diese Integration wurde nach der
> dokumentierten Twilio-API geschrieben, ohne echtes Twilio-Konto. Wenn etwas
> nicht wie beschrieben funktioniert, sag es im
> [Gladys-Forum](https://community.gladysassistant.com) oder in den
> [Issues](https://github.com/guim31/gladys-twilio/issues).

## Was du brauchst

- Gladys Assistant 5.1.0 oder neuer.
- Ein Twilio-Konto mit Guthaben und eine **Twilio-Telefonnummer**, die SMS
  senden und Anrufe in die gewünschten Länder tätigen kann. Ein Testkonto
  funktioniert, mit seinen Grenzen: Es erreicht nur die in Twilio bestätigten
  Nummern, und seine Nachrichten beginnen mit einem Twilio-Hinweis.
- Die **Account SID** (auf der Startseite der Twilio-Konsole, `AC…`).
- Am besten einen **API-Schlüssel**: in der Twilio-Konsole **Account** → **API
  keys & tokens** → **Create API key**, Typ _Standard_. Notiere seine SID
  (`SK…`) und sein Secret, das nur einmal angezeigt wird. Ohne API-Schlüssel
  funktioniert auch das **Auth Token** des Kontos, es gibt aber vollen Zugriff
  auf das Konto.
- In der Twilio-Konsole müssen die **geografischen Berechtigungen** für SMS und
  Sprache die Länder deiner Empfänger erlauben.

## Konfiguration

1. Installiere die Integration aus dem Gladys-Katalog.
2. Trag unter **Konfiguration** die **Account SID**, die **SID des
   API-Schlüssels** und das **Secret des API-Schlüssels** (oder das **Auth
   Token**) ein, und den **Absender**: deine Twilio-Nummer im internationalen
   Format, z. B. `+4915112345678`.
3. **Standardempfänger**: die Nummern, die gelten, wenn eine Aktion keine nennt,
   durch Kommas getrennt, die wichtigste zuerst. Immer im internationalen Format
   (`+` und Ländervorwahl): `0151 12345678` wird abgelehnt, weil das Land nicht
   erraten werden kann.
4. Stell den **Kostenschutz** ein (siehe unten), die **Stimme** und die
   **Klingeldauer** der Anrufe und die **Sprache** (standardmäßig Französisch).
5. Speichere und klick auf **Verbindung testen**: Die Meldung unter dem Knopf
   nennt das Konto, seinen Typ, sein Guthaben, ob der Absender zum Konto gehört,
   und den heutigen Verbrauch.
6. Klick auf **Test-SMS senden** (an die Standardempfänger oder an die
   eingegebene Nummer), um den ganzen Weg zu prüfen.
7. Öffne den Reiter **Entdecken** und füge das Gerät **Twilio-Konto** hinzu.

Der Absender kann auch die SID eines **Messaging Service** (`MG…`) oder ein
alphanumerischer Absendername sein (`Gladys`, höchstens 11 Zeichen, wo das
Zielland es erlaubt). Beides gilt nur für SMS: Ein Anruf braucht immer eine
Twilio-Telefonnummer.

### Kostenschutz

Vier Grenzen: **Höchstens SMS pro Stunde**, **Höchstens SMS pro Tag**,
**Höchstens Anrufe pro Stunde**, **Höchstens Anrufe pro Tag** (standardmäßig 10,
30, 5 und 10). Die Stunde ist gleitend, der Tag ist der Kalendertag in der
Zeitzone von Gladys. Jeder Empfänger zählt als eine SMS. Über einer Grenze geht
nichts mehr raus, bis das Zeitfenster wieder frei ist: Die ersten Empfänger
einer Liste kommen zuerst dran, die anderen werden zurückgehalten. Eine Grenze
von 0 sperrt diese Art des Sendens. Die Zähler liegen unter `/data` und
überstehen einen Neustart. Nur von Twilio angenommene Sendungen zählen: Eine
abgelehnte Anfrage wird nicht berechnet.

## Das Gerät „Twilio-Konto“

| Funktion                | Was sie zeigt                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| **Guthaben**            | Das Guthaben des Kontos in seiner Währung, alle 15 Minuten gelesen.                        |
| **Heute gesendete SMS** | Von Twilio seit Mitternacht angenommene SMS.                                               |
| **Heutige Anrufe**      | Von Twilio seit Mitternacht angenommene Anrufe.                                            |
| **Letzter Fehler**      | Datum, SMS oder Anruf, maskierte Nummer und Grund des letzten Fehlers, oder _Kein Fehler_. |

Euro, Dollar und Pfund haben ihre Einheit; eine andere Währung zeigt nur den
Betrag. Das Guthaben erscheint erst, wenn Twilio es lesen lässt: Ein
eingeschränkter API-Schlüssel sieht es vielleicht nicht, was das Senden nicht
verhindert.

## Dashboard-Widget

Das Widget **Twilio** zeigt das Guthaben, die SMS und Anrufe des Tages gegenüber
den Tageslimits (orange, sobald erreicht), den Zustand des Kontos und den
letzten Fehler, mit einem Link zur Twilio-Konsole zum Aufladen. Es sendet selbst
nichts.

## Szenen

### Aktionen

**SMS senden**: eine SMS an jeden Empfänger (höchstens 10). _Empfänger_: Nummern
durch Kommas getrennt, leer für die Standardempfänger. _Nachricht_: bis zu 1600
Zeichen, mit den Variablen der Szene (tippe `{{`, um eine einzufügen).
Ergebnisse für die nächsten Schritte: _Gesendete SMS_, _Vom Kostenschutz
zurückgehalten_, _Von Twilio abgelehnt_.

**Anruf tätigen**: ruft eine Nummer an (leer: der erste Standardempfänger) und
liest die _Vorgelesene Nachricht_ (bis zu 1000 Zeichen) mit einer Sprachausgabe
vor. _Sprache_ (Englisch, Französisch, Deutsch oder Spanisch) und _Stimme_
(weiblich oder männlich) sind standardmäßig die der Konfiguration; die Nachricht
wird 1 bis 3 Mal vorgelesen. Mit _Auf die Antwort warten_ (standardmäßig an)
wartet die Szene, bis feststeht, ob abgenommen wurde, höchstens die Klingeldauer
plus 20 Sekunden. Ergebnisse: _Abgenommen_ (ja oder nein), _Ergebnis des Anrufs_
und _SID des Anrufs_. Das Ergebnis ist eines von:

- `answered`: jemand (oder eine Mailbox) hat abgenommen;
- `no-answer`, `busy`, `failed`, `canceled`: der Anruf kam nicht durch (keine
  Antwort, besetzt, fehlgeschlagen, abgebrochen);
- `refused`: Twilio hat den Anruf abgelehnt (siehe _Letzter Fehler_);
- `blocked`: vom Kostenschutz zurückgehalten;
- `pending`: noch nicht bekannt (nicht abgewartet oder klingelt bei Fristende
  noch).

Ein Fehler auf Twilios Seite hält die Szene nie an: Prüfe die Ergebnisse mit
der Bedingung _Nur fortsetzen, wenn_. Nur eine Aktion, die gar nicht laufen
kann, schlägt fehl (keine Konfiguration, kein Empfänger, leere Nachricht, eine
Nummer nicht im internationalen Format).

### Auslöser

**SMS oder Anruf fehlgeschlagen**: Eine SMS oder ein Anruf hat den Empfänger
nicht erreicht. Filter: _SMS oder Anruf_, _Ergebnis_ (von Twilio abgelehnt,
fehlgeschlagen, SMS nicht zugestellt, keine Antwort, Leitung besetzt,
abgebrochen), _Empfänger_. Variablen: _SMS oder Anruf_ (`sms` oder `call`),
_Empfänger_, _Ergebnis_, _Grund_ (in der eingestellten Sprache),
_Twilio-Fehlercode_. Twilio bestätigt die Zustellung im Nachhinein: Eine SMS
wird nach 1, 5 und 20 Minuten nachgelesen, ein Anruf nach seiner Klingeldauer.

**Limit des Kostenschutzes erreicht**: SMS oder Anrufe wurden von einer Grenze
zurückgehalten. Filter: _SMS oder Anruf_, _Limit_ (pro Stunde oder pro Tag).
Variablen: die Art, das Limit (`hour` oder `day`), sein Wert und die Zahl der
zurückgehaltenen. Einmal pro Vorfall ausgelöst, nicht bei jedem Versuch: So kann
er dich über einen anderen Kanal warnen, ohne ihn zu fluten.

### Ideen für Szenen

- **Wasserschaden**: beim Wassermelder **SMS senden** „Wasser im Keller!“ an
  die Familie, dann **Anruf tätigen** beim ersten Standardempfänger.
- **Niemand nimmt ab**: **Anruf tätigen** bei einem Angehörigen mit _Auf die
  Antwort warten_, dann _Nur fortsetzen, wenn_ _Abgenommen_ falsch ist, dann
  **Anruf tätigen** beim Nachbarn.
- **Etwas läuft in einer Schleife**: bei **Limit des Kostenschutzes erreicht**
  eine Nachricht über die Gladys-App oder einen anderen Kanal senden, um die
  Szene zu finden, die so viel sendet.

## Kosten und Grenzen von Twilio

- Twilio berechnet jede SMS **pro Segment**: 160 Zeichen, oder 70, sobald der
  Text ein Zeichen außerhalb des GSM-Alphabets enthält (`ê`, `ç`, `œ`, ein
  Emoji). Ein Text mit 1600 Zeichen kann 23 SMS ergeben. Anrufe werden pro
  angefangene Minute berechnet; ein Anruf wird nach 3 Minuten beendet.
- Die Stimmen sind Standard-Stimmen von Amazon Polly, die Twilio bereitstellt;
  siehe die Twilio-Preise für Sprachausgabe.
- Anfragen an `api.twilio.com`: das Konto und sein Guthaben alle 15 Minuten
  (zwei Lesezugriffe), eine Anfrage pro SMS oder Anruf, dann ein paar
  Lesezugriffe, um das Ergebnis zu verfolgen (alle 3 Sekunden, solange auf einen
  Anruf gewartet wird). Weit unter den Grenzen der Twilio-API; eine Antwort
  `429` wird als „zu viele Anfragen“ gemeldet.
- Twilio tätigt höchstens etwa einen Anruf pro Sekunde und Konto und reiht die
  SMS im Takt des Absenders ein: Eine Liste mit 10 Empfängern dauert ein paar
  Sekunden.
- Die [Nutzungsrichtlinie](https://www.twilio.com/en-us/legal/aup) von Twilio
  und die [Länderrichtlinien](https://www.twilio.com/en-us/guidelines/sms)
  gelten: Schreib nur Leuten, die zugestimmt haben; ein Empfänger, der mit STOP
  geantwortet hat, wird von Twilio blockiert.

## Fehlerbehebung

- **„Zugangsdaten von Twilio abgelehnt“**: Prüf die Account SID und das Secret
  des API-Schlüssels (oder das Auth Token). Ein API-Schlüssel muss zum selben
  Konto gehören.
- **„Testkonto: Bestätige diese Nummer zuerst in Twilio“**: Füge den Empfänger
  zu den bestätigten Nummern der Twilio-Konsole hinzu oder stell das Konto auf
  kostenpflichtig um.
- **„Land in den geografischen Berechtigungen von Twilio nicht erlaubt“**:
  Aktiviere das Land in der Twilio-Konsole, für SMS und für Sprache.
- **„der Absender ist keine Nummer deines Twilio-Kontos“**: Kopier die Nummer aus
  **Phone Numbers** → **Active numbers**, im internationalen Format.
- **„nicht zugestellt (Twilio 30003)“** und andere Codes `30xxx`: Der Netzbetreiber
  konnte die SMS nicht zustellen (Handy aus, als Spam gefiltert, Festnetz). Der
  Code wird unter `https://www.twilio.com/docs/api/errors/<code>` erklärt.
- **Nichts geht raus und das Widget zeigt einen Zähler in Orange**: Der
  Kostenschutz greift; erhöhe die Grenze oder warte, bis das Zeitfenster frei
  ist.
- Ausführliche Protokolle: Setz `LOG_LEVEL=debug` für die Integration. Nummern
  werden in den Protokollen immer maskiert, Secrets nie geschrieben.

## Grenzen

- **Keine eingehenden SMS.** Twilio stellt eingehende Nachrichten zu, indem es
  eine öffentliche URL aufruft; Gladys ist nicht aus dem Internet erreichbar,
  und das Webhook-Relay von Gladys Plus gibt den Header `X-Twilio-Signature`
  nicht weiter, sodass der Absender einer Nachricht nicht geprüft werden könnte.
  Eingehende SMS werden daher nicht unterstützt.
- Eine Mailbox, die abnimmt, zählt als `answered`: Stell eine kürzere
  **Klingeldauer** ein, um vorher aufzulegen.
- Keine MMS (Bilder) und kein WhatsApp: nur SMS und Sprache.
- Die Namen der Funktionen werden beim Hinzufügen des Geräts festgelegt, in der
  damals konfigurierten Sprache.
- Ohne Twilio-Konto entwickelt: Die API-Antworten stammen aus der
  Twilio-Dokumentation, nicht von einem echten Konto.
