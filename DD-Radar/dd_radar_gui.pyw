"""DD-Radar — grafische Oberfläche (Tkinter).

Start über „DD-Radar starten.bat" oder Doppelklick auf diese Datei.
"""

from __future__ import annotations

import os
import queue
import subprocess
import sys
import threading
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, ttk

sys.path.insert(0, str(Path(__file__).parent))

import dd_radar                       # noqa: E402
import taxonomy                       # noqa: E402
from api_client import ApiFehler      # noqa: E402
from config import load_config        # noqa: E402

BLAU = "#1F3864"


class App(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("DD-Radar — Datenraum-Bereitschaftsprüfung")
        self.geometry("980x720")
        self.minsize(820, 620)

        self.meldungen: queue.Queue[str] = queue.Queue()
        self.laeuft = False
        self.pfade: dict[str, Path] = {}

        self._baue_oberflaeche()
        self.after(120, self._pumpe)

    # -- Aufbau -------------------------------------------------------------

    def _baue_oberflaeche(self) -> None:
        kopf = tk.Frame(self, bg=BLAU)
        kopf.pack(fill="x")
        tk.Label(kopf, text="DD-Radar", bg=BLAU, fg="white",
                 font=("Segoe UI", 20, "bold")).pack(anchor="w", padx=18, pady=(14, 0))
        tk.Label(kopf, text="Vorhandene Unterlagen kategorisieren · fehlende Unterlagen aufspüren",
                 bg=BLAU, fg="#c9d6ea", font=("Segoe UI", 10)).pack(anchor="w", padx=18, pady=(0, 14))

        rahmen = ttk.Frame(self, padding=16)
        rahmen.pack(fill="both", expand=True)

        # Verzeichnis
        ttk.Label(rahmen, text="Zu analysierendes Verzeichnis",
                  font=("Segoe UI", 9, "bold")).grid(row=0, column=0, sticky="w")
        self.var_verzeichnis = tk.StringVar()
        zeile = ttk.Frame(rahmen)
        zeile.grid(row=1, column=0, columnspan=3, sticky="ew", pady=(2, 12))
        zeile.columnconfigure(0, weight=1)
        ttk.Entry(zeile, textvariable=self.var_verzeichnis).grid(row=0, column=0, sticky="ew")
        ttk.Button(zeile, text="Durchsuchen …", command=self._waehle_verzeichnis)\
            .grid(row=0, column=1, padx=(8, 0))

        # Mandant + Profil
        ttk.Label(rahmen, text="Unternehmen / Mandant",
                  font=("Segoe UI", 9, "bold")).grid(row=2, column=0, sticky="w")
        ttk.Label(rahmen, text="Prüfprofil",
                  font=("Segoe UI", 9, "bold")).grid(row=2, column=1, sticky="w", padx=(12, 0))
        self.var_mandant = tk.StringVar()
        self.var_profil = tk.StringVar(value="VC")
        ttk.Entry(rahmen, textvariable=self.var_mandant, width=44)\
            .grid(row=3, column=0, sticky="ew", pady=(2, 4))
        ttk.Combobox(rahmen, textvariable=self.var_profil, state="readonly", width=10,
                     values=list(taxonomy.PROFILE)).grid(row=3, column=1, sticky="w",
                                                         padx=(12, 0), pady=(2, 4))
        self.lbl_profil = ttk.Label(rahmen, text=taxonomy.PROFILE["VC"],
                                    foreground="#555", font=("Segoe UI", 8))
        self.lbl_profil.grid(row=4, column=0, columnspan=3, sticky="w", pady=(0, 10))
        self.var_profil.trace_add("write", lambda *_: self.lbl_profil.configure(
            text=taxonomy.PROFILE.get(self.var_profil.get(), "")))

        # Optionen
        opt = ttk.LabelFrame(rahmen, text="Optionen", padding=10)
        opt.grid(row=5, column=0, columnspan=3, sticky="ew", pady=(0, 12))
        self.var_offline = tk.BooleanVar(value=False)
        self.var_vision = tk.BooleanVar(value=True)
        self.var_anonym = tk.BooleanVar(value=False)
        self.var_mock = tk.BooleanVar(value=False)
        self.var_max = tk.StringVar(value="0")

        ttk.Checkbutton(opt, text="Offline-Modus (keine Datenübermittlung, nur Stichworte)",
                        variable=self.var_offline).grid(row=0, column=0, sticky="w", columnspan=2)
        ttk.Checkbutton(opt, text="Gescannte PDFs per Bilderkennung auswerten",
                        variable=self.var_vision).grid(row=1, column=0, sticky="w")
        ttk.Checkbutton(opt, text="E-Mail/Telefon/IBAN vor Versand maskieren",
                        variable=self.var_anonym).grid(row=1, column=1, sticky="w", padx=(24, 0))
        ttk.Checkbutton(opt, text="Testlauf ohne echte KI-Aufrufe (Mock)",
                        variable=self.var_mock).grid(row=2, column=0, sticky="w")
        ttk.Label(opt, text="max. Dokumente (0 = alle):").grid(row=2, column=1, sticky="e")
        ttk.Entry(opt, textvariable=self.var_max, width=6).grid(row=2, column=2, sticky="w", padx=6)

        # Steuerung
        steuer = ttk.Frame(rahmen)
        steuer.grid(row=6, column=0, columnspan=3, sticky="ew", pady=(0, 10))
        self.btn_start = ttk.Button(steuer, text="Analyse starten", command=self._starte)
        self.btn_start.pack(side="left")
        self.btn_excel = ttk.Button(steuer, text="Excel-Bericht öffnen", state="disabled",
                                    command=lambda: self._oeffne("excel"))
        self.btn_excel.pack(side="left", padx=(10, 0))
        self.btn_html = ttk.Button(steuer, text="Dashboard öffnen", state="disabled",
                                   command=lambda: self._oeffne("html"))
        self.btn_html.pack(side="left", padx=(10, 0))
        self.btn_docx = ttk.Button(steuer, text="Kurzbericht öffnen", state="disabled",
                                   command=lambda: self._oeffne("docx"))
        self.btn_docx.pack(side="left", padx=(10, 0))

        self.fortschritt = ttk.Progressbar(rahmen, mode="indeterminate")
        self.fortschritt.grid(row=7, column=0, columnspan=3, sticky="ew", pady=(0, 8))

        # Protokoll
        self.protokoll = tk.Text(rahmen, height=18, wrap="word", font=("Consolas", 9),
                                 bg="#fbfbfd", relief="solid", borderwidth=1)
        self.protokoll.grid(row=8, column=0, columnspan=3, sticky="nsew")
        leiste = ttk.Scrollbar(rahmen, command=self.protokoll.yview)
        leiste.grid(row=8, column=3, sticky="ns")
        self.protokoll.configure(yscrollcommand=leiste.set, state="disabled")

        tk.Label(rahmen, font=("Segoe UI", 8), fg="#777", justify="left",
                 text="KI-Auswertung ausschließlich über LOGICC (api.logicc.io). Jeder Aufruf wird in "
                      ".dd-radar/audit-log.jsonl protokolliert. Ergebnisse sind Vorschläge und vor "
                      "Verwendung anwaltlich zu prüfen.")\
            .grid(row=9, column=0, columnspan=3, sticky="w", pady=(8, 0))

        rahmen.columnconfigure(0, weight=1)
        rahmen.rowconfigure(8, weight=1)

    # -- Aktionen -----------------------------------------------------------

    def _waehle_verzeichnis(self) -> None:
        pfad = filedialog.askdirectory(title="Verzeichnis mit den Unterlagen wählen")
        if pfad:
            self.var_verzeichnis.set(pfad)
            if not self.var_mandant.get():
                self.var_mandant.set(Path(pfad).name)

    def _log(self, text: str) -> None:
        self.protokoll.configure(state="normal")
        self.protokoll.insert("end", text + "\n")
        self.protokoll.see("end")
        self.protokoll.configure(state="disabled")

    def _pumpe(self) -> None:
        while True:
            try:
                self._log(self.meldungen.get_nowait())
            except queue.Empty:
                break
        self.after(120, self._pumpe)

    def _starte(self) -> None:
        if self.laeuft:
            return
        verzeichnis = Path(self.var_verzeichnis.get().strip('" '))
        if not verzeichnis.is_dir():
            messagebox.showerror("DD-Radar", "Bitte ein gültiges Verzeichnis wählen.")
            return

        overrides = {
            "profil": self.var_profil.get(),
            "offline_mode": "1" if self.var_offline.get() else "0",
            "use_mock": "1" if self.var_mock.get() else "0",
            "use_vision": "1" if self.var_vision.get() else "0",
            "anonymisieren": "1" if self.var_anonym.get() else "0",
            "max_docs": self.var_max.get().strip() or "0",
        }
        try:
            cfg = load_config(overrides)
        except ValueError:
            messagebox.showerror("DD-Radar", "'max. Dokumente' muss eine Zahl sein.")
            return

        self.laeuft = True
        self.btn_start.configure(state="disabled")
        for btn in (self.btn_excel, self.btn_html, self.btn_docx):
            btn.configure(state="disabled")
        self.fortschritt.start(12)
        self._log("─" * 78)

        threading.Thread(target=self._lauf, args=(verzeichnis, cfg), daemon=True).start()

    def _lauf(self, verzeichnis: Path, cfg: dict) -> None:
        try:
            ergebnis = dd_radar.analysiere_verzeichnis(
                verzeichnis, cfg,
                mandant=self.var_mandant.get().strip(),
                fortschritt=self.meldungen.put,
            )
            self.pfade = ergebnis["pfade"]
            self.meldungen.put("")
            for name, pfad in self.pfade.items():
                self.meldungen.put(f"{name:6s} → {pfad}")
            self.after(0, self._fertig, True, "")
        except (ApiFehler, RuntimeError, OSError) as exc:
            self.meldungen.put(f"FEHLER: {exc}")
            self.after(0, self._fertig, False, str(exc))

    def _fertig(self, erfolg: bool, fehler: str) -> None:
        self.laeuft = False
        self.fortschritt.stop()
        self.btn_start.configure(state="normal")
        if erfolg:
            for btn in (self.btn_excel, self.btn_html, self.btn_docx):
                btn.configure(state="normal")
        else:
            messagebox.showerror("DD-Radar", fehler)

    def _oeffne(self, schluessel: str) -> None:
        pfad = self.pfade.get(schluessel)
        if not pfad:
            return
        try:
            if sys.platform == "win32":
                os.startfile(pfad)                      # noqa: S606
            else:
                subprocess.run(["xdg-open", str(pfad)], check=False)
        except OSError as exc:
            messagebox.showerror("DD-Radar", f"Datei konnte nicht geöffnet werden: {exc}")


if __name__ == "__main__":
    App().mainloop()
