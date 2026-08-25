# LEON ROYALE

Ein 3D-Battle-Royale im Browser — gebaut mit [three.js](https://threejs.org), ohne Build-Schritt
und ohne externe Assets. Alle Figuren, Waffen, Fahrzeuge und die Insel werden zur Laufzeit
prozedural aus Geometrie und Canvas-Texturen erzeugt.

## Spielen

```bash
# irgendeinen statischen Server im Projektordner starten, z. B.
python3 -m http.server 8000
# danach http://localhost:8000 öffnen
```

Ein Server ist nötig, weil das Spiel aus ES-Modulen besteht (`file://` blockiert Modul-Imports).
three.js liegt unter `vendor/` — das Spiel läuft komplett offline.

## Inhalte

**Skins & Items**
- **Kratos** — Startskin: blasse Haut, rote Kriegsbemalung, Bart, Schulterpanzer und Kriegsrock.
- **Leviathan-Axt** — Start-Spitzhacke: Frostklinge mit leuchtenden Runen, Lederwicklung, Messingbeschlägen.
- **Atreus** (Item-Shop, 1.200 V-Bucks) — kleinerer Rig, Fellkragen, Köcher mit Pfeilen auf dem Rücken.
- **Porsche 991** (Item-Shop, 2.000 V-Bucks) — fahrbarer Heckmotor-Sportwagen, Karosserie als extrudiertes
  Seitenprofil, ausfahrender Heckflügel ab 80 km/h, prozeduraler Motorsound. Zusätzlich in GT-Silber.
- Waldläufer und Nachtfalke als weitere Shop-Skins.

Gekaufte Items landen in der **Garderobe**; die Ausrüstung steht live in der Lobby auf der Bühne.
V-Bucks, Besitz, Ausrüstung und Arena-Hype werden im `localStorage` gespeichert.

## Modi

### Battle Royale (mit Bauen)
30 Spieler, 430 m große Insel mit acht benannten Orten, Truhen, Sturmkreis in sieben Phasen.
Material wird abgebaut (Bäume → Holz, Felsen → Stein, Wracks → Metall) und in Wände, Rampen und
Böden verbaut. Bauteile haben Trefferpunkte und lassen sich zerschießen.

### Arena (ohne Bauen)
16 Spieler, kleinere Insel, schnellerer Sturm. **Bauen ist deaktiviert** — alle starten voll ausgerüstet
mit SMG, Schrotflinte, Bogen und 50 Schild. Ergebnis zählt auf ein **Hype**-Konto ein:

| Ereignis | Hype |
|---|---|
| Eliminierung | +8 |
| Sieg | +60 |
| Platz 2–3 | +40 |
| Platz 4–5 | +25 |
| oberes Viertel | +12 |
| obere Hälfte | +5 |
| Buy-In ab Division IV | −15 bis −60 |

Acht Divisionen von *Offene Division I* bis *Champion Division VIII*; ab Division IV kostet der
Einstieg Hype, ein früher Tod kann also Rang kosten.

## Steuerung

| Taste | Aktion |
|---|---|
| `W A S D` | Bewegen |
| Maus | Umsehen · `LMB` Angriff/Schuss · `RMB` Zielen |
| `Shift` / `Space` | Sprinten / Springen |
| `1`–`4` | Leviathan-Axt · SMG · Schrotflinte · Bogen (Mausrad wechselt ebenfalls) |
| `R` | Nachladen |
| `Q` / `E` / `R` | Wand / Rampe / Boden bauen · `C` Baumaterial wechseln *(nur Battle Royale)* |
| `F` | Truhe öffnen · Porsche ein-/aussteigen |
| `Tab` | Große Karte |
| `Esc` | Pause |

Im Auto: `W`/`S` Gas und Bremse, `A`/`D` Lenken, `Space` Handbremse, `F` Aussteigen.
Gegner anfahren macht Schaden.

## Aufbau

```
index.html            Menüs, HUD, Import-Map
css/style.css         gesamtes UI
vendor/three.module.js three.js (lokal, kein CDN)
src/
  main.js             Renderer, Lobby-Bühne, Zustandsautomat, Hauptschleife
  match.js            eine Runde: Welt, Spieler, Bots, Sturm, Truhen, Ergebnis
  save.js             localStorage (V-Bucks, Besitz, Ausrüstung, Hype)
  engine/             Eingabe (Pointer Lock) und prozedurale WebAudio-Sounds
  world/              Value-Noise, Insel-Heightfield, Props, Gebäude, Spatial Grid
  entities/           Charakter-Rigs (Kratos, Atreus, Bots), Spieler, Bot-KI
  items/              Leviathan-Axt, Waffendefinitionen und -modelle
  vehicles/           Porsche 991 inkl. Fahrphysik
  systems/            Trefferabfrage/Effekte, Bau-System, Sturm
  ui/                 Katalog, Lobby/Shop, HUD, 3D-Vorschaubilder
```

Kollisionen und Schussstrahlen laufen über ein uniformes Gitter (8 m Zellen), damit die rund
1.200 Kollisionsobjekte einer Insel nicht linear durchsucht werden müssen.

## Rechtliches

Fan-Projekt zu Lern- und Spielzwecken. Es werden keine Assets, Texturen oder Modelle Dritter
verwendet — sämtliche Geometrie ist in diesem Repository aus Code erzeugt. Namen von Figuren und
Fahrzeugen sind Marken ihrer jeweiligen Inhaber.
