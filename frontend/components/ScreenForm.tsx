"use client";

import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Zap, Loader2, ArrowRight } from "lucide-react";
import type {
  ScreenPayload,
  ScreenScenario,
  ScreenedCase,
} from "@/lib/screen/types";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { SectionLabel } from "./shared";

const SCENARIOS: { value: ScreenScenario; label: string; sub: string }[] = [
  { value: "off_ramp", label: "Off-ramp", sub: "crypto → fiat" },
  { value: "on_ramp", label: "On-ramp", sub: "fiat → crypto" },
  { value: "fiat", label: "Fiat", sub: "fiat → fiat" },
];

interface Preset {
  label: string;
  hint: "MATCH" | "REVIEW" | "CLEAR";
  apply: (s: FormState) => Partial<FormState>;
}

const PRESETS: Record<ScreenScenario, Preset[]> = {
  off_ramp: [
    { label: "Sanctioned wallet", hint: "MATCH", apply: () => ({ origWallet: "0xSANC_TORNADO", benefName: "Northbridge FX" }) },
    { label: "High-taint source", hint: "REVIEW", apply: () => ({ origWallet: "0xHIGH_TAINT", benefName: "Northbridge FX" }) },
    { label: "Clean wallet", hint: "CLEAR", apply: () => ({ origWallet: "0xCLEAN_WALLET", benefName: "Northbridge FX" }) },
  ],
  on_ramp: [
    { label: "High-taint destination", hint: "REVIEW", apply: () => ({ benefWallet: "0xHIGH_TAINT", origName: "Meridian Capital" }) },
    { label: "Forward-exposed", hint: "REVIEW", apply: () => ({ benefWallet: "0xFWD_EXPOSED", origName: "Meridian Capital" }) },
    { label: "Clean destination", hint: "CLEAR", apply: () => ({ benefWallet: "0xCLEAN_WALLET", origName: "Meridian Capital" }) },
  ],
  fiat: [
    { label: "Sanctioned name (Darkflow)", hint: "MATCH", apply: () => ({ benefName: "Dark Flow Finance Limited", benefReg: "DF-99821", origName: "Meridian Trading Ltd" }) },
    { label: "Sanctioned UBO (shell)", hint: "MATCH", apply: () => ({ benefName: "Horizon Consulting SARL", ownershipNode: "c_3278", benefReg: "", origName: "Meridian Trading Ltd" }) },
    { label: "Partial UBO", hint: "REVIEW", apply: () => ({ benefName: "Baltic Logistics SARL", ownershipNode: "c_83810", benefReg: "", origName: "Meridian Trading Ltd" }) },
    { label: "Clean company", hint: "CLEAR", apply: () => ({ benefName: "Bob's Coffee Supply", ownershipNode: "", benefReg: "", origName: "Acme Global Ltd" }) },
  ],
};

interface FormState {
  origName: string;
  origWallet: string;
  benefName: string;
  benefWallet: string;
  benefReg: string;
  amount: string;
  asset: string;
  currency: string;
  ownershipNode: string;
}

const EMPTY: FormState = {
  origName: "",
  origWallet: "",
  benefName: "",
  benefWallet: "",
  benefReg: "",
  amount: "25000",
  asset: "USDC",
  currency: "EUR",
  ownershipNode: "",
};

const HINT_STYLE: Record<string, string> = {
  MATCH: "border-risk-high/40 text-risk-high",
  REVIEW: "border-risk-med/40 text-risk-med",
  CLEAR: "border-risk-low/40 text-risk-low",
};

export function ScreenForm({
  open,
  onOpenChange,
  onResult,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onResult: (c: ScreenedCase, via: "live" | "mock") => void;
}) {
  const [scenario, setScenario] = useState<ScreenScenario>("off_ramp");
  const [f, setF] = useState<FormState>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (patch: Partial<FormState>) => setF((cur) => ({ ...cur, ...patch }));
  const cryptoSrc = scenario === "off_ramp";
  const cryptoDst = scenario === "on_ramp";

  async function submit() {
    setSubmitting(true);
    setError(null);
    const payload: ScreenPayload = {
      scenario,
      amount: f.amount,
      asset: scenario === "fiat" ? undefined : f.asset,
      currency: scenario === "fiat" ? f.currency : undefined,
      originator: {
        name: f.origName || undefined,
        wallet: cryptoSrc ? f.origWallet || undefined : undefined,
      },
      beneficiary: {
        name: f.benefName || undefined,
        wallet: cryptoDst ? f.benefWallet || undefined : undefined,
        reg_no: f.benefReg || undefined,
      },
      ownershipNode: f.ownershipNode || undefined,
    };
    try {
      const res = await fetch("/api/screen", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`screen ${res.status}`);
      const data = (await res.json()) as { case: ScreenedCase; via: "live" | "mock" };
      onResult(data.case, data.via);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "screening failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[1px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[92vh] w-[560px] max-w-[94vw] -translate-x-1/2 -translate-y-1/2 flex-col border border-hairline bg-surface outline-none">
          {/* header */}
          <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
            <div className="flex items-center gap-2">
              <Zap className="size-4 stroke-[1.5] text-accent" />
              <Dialog.Title className="text-[14px] font-medium text-text">
                Screen a payment
              </Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="close">
                <X className="size-4 stroke-[1.5]" />
              </Button>
            </Dialog.Close>
          </div>

          <div className="flex flex-col gap-4 overflow-y-auto p-4">
            {/* scenario */}
            <div className="flex flex-col gap-1.5">
              <SectionLabel>Rail</SectionLabel>
              <div className="flex border border-hairline">
                {SCENARIOS.map((s, i) => (
                  <button
                    key={s.value}
                    onClick={() => setScenario(s.value)}
                    className={cn(
                      "flex flex-1 flex-col items-center gap-0.5 px-2 py-2 outline-none transition-colors",
                      i > 0 && "border-l border-hairline",
                      scenario === s.value
                        ? "bg-accent-wash text-text"
                        : "text-muted hover:text-text",
                    )}
                  >
                    <span className="text-[12px] font-medium">{s.label}</span>
                    <span className="font-mono text-[10px] text-faint">{s.sub}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* presets */}
            <div className="flex flex-col gap-1.5">
              <SectionLabel>Try a case</SectionLabel>
              <div className="flex flex-wrap gap-1.5">
                {PRESETS[scenario].map((p) => (
                  <button
                    key={p.label}
                    onClick={() => set(p.apply(f))}
                    className={cn(
                      "flex items-center gap-1.5 border px-2 py-1 text-[11px] transition-colors hover:bg-surface2",
                      "border-hairline text-muted",
                    )}
                  >
                    {p.label}
                    <span
                      className={cn(
                        "border px-1 font-mono text-[9px] uppercase tracking-[0.04em]",
                        HINT_STYLE[p.hint],
                      )}
                    >
                      {p.hint}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* originator */}
            <div className="flex flex-col gap-1.5">
              <SectionLabel>Originator{cryptoSrc ? " (sends crypto)" : ""}</SectionLabel>
              <Input
                placeholder="name"
                value={f.origName}
                onChange={(e) => set({ origName: e.target.value })}
              />
              {!cryptoSrc && <NameMatch name={f.origName} />}
              {cryptoSrc && (
                <Input
                  className="font-mono"
                  placeholder="source wallet (0x…)"
                  value={f.origWallet}
                  onChange={(e) => set({ origWallet: e.target.value })}
                />
              )}
            </div>

            {/* beneficiary */}
            <div className="flex flex-col gap-1.5">
              <SectionLabel>Beneficiary{cryptoDst ? " (receives crypto)" : ""}</SectionLabel>
              <Input
                placeholder={scenario === "fiat" ? "company name" : "name"}
                value={f.benefName}
                onChange={(e) => set({ benefName: e.target.value })}
              />
              <NameMatch name={f.benefName} />
              {cryptoDst && (
                <Input
                  className="font-mono"
                  placeholder="destination wallet (0x…)"
                  value={f.benefWallet}
                  onChange={(e) => set({ benefWallet: e.target.value })}
                />
              )}
              {scenario === "fiat" && (
                <Input
                  className="font-mono"
                  placeholder="registry no. (optional)"
                  value={f.benefReg}
                  onChange={(e) => set({ benefReg: e.target.value })}
                />
              )}
            </div>

            {/* amount */}
            <div className="flex items-end gap-2">
              <div className="flex flex-1 flex-col gap-1.5">
                <SectionLabel>Amount</SectionLabel>
                <Input
                  className="font-mono tnum"
                  inputMode="decimal"
                  value={f.amount}
                  onChange={(e) => set({ amount: e.target.value })}
                />
              </div>
              <div className="flex w-24 flex-col gap-1.5">
                <SectionLabel>{scenario === "fiat" ? "Currency" : "Asset"}</SectionLabel>
                <Input
                  className="font-mono"
                  value={scenario === "fiat" ? f.currency : f.asset}
                  onChange={(e) =>
                    scenario === "fiat"
                      ? set({ currency: e.target.value })
                      : set({ asset: e.target.value })
                  }
                />
              </div>
            </div>

            {error && (
              <p className="border border-risk-high/40 bg-risk-high-wash px-2 py-1.5 font-mono text-[11px] text-risk-high">
                {error}
              </p>
            )}
          </div>

          {/* footer */}
          <div className="flex items-center justify-between border-t border-hairline px-4 py-3">
            <span className="font-mono text-[10px] text-faint">
              engine screens both parties · grounded by list version
            </span>
            <Button
              variant="secondary"
              onClick={submit}
              disabled={submitting}
              className="gap-1.5 border border-accent/40 bg-accent-wash text-accent hover:bg-accent-wash"
            >
              {submitting ? (
                <Loader2 className="size-3.5 animate-spin stroke-[1.5]" />
              ) : (
                <ArrowRight className="size-3.5 stroke-[1.5]" />
              )}
              {submitting ? "Screening…" : "Run screening"}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// debounced live fuzzy-match chip — proves the resolver is running for real
function NameMatch({ name }: { name: string }) {
  const [match, setMatch] = useState<{ entity: string; score: number } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = name.trim();
    if (q.length < 3) {
      setMatch(null);
      return;
    }
    let live = true;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/resolve", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: q, type: "business" }),
        });
        const data = (await res.json()) as { matched_entity: string | null; name_score: number };
        if (live)
          setMatch(
            data.matched_entity
              ? { entity: data.matched_entity, score: data.name_score }
              : null,
          );
      } catch {
        if (live) setMatch(null);
      } finally {
        if (live) setLoading(false);
      }
    }, 350);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [name]);

  if (name.trim().length < 3) return null;
  return (
    <div className="flex h-4 items-center gap-1.5 font-mono text-[10px]">
      {loading && !match ? (
        <span className="text-faint">screening name…</span>
      ) : match ? (
        <span className="flex items-center gap-1 text-risk-high">
          <span className="size-1.5 bg-risk-high" aria-hidden />
          SDN hit: {match.entity} · {(match.score * 100).toFixed(0)}% match
        </span>
      ) : (
        <span className="flex items-center gap-1 text-risk-low">
          <span className="size-1.5 bg-risk-low" aria-hidden />
          no sanctions-list match
        </span>
      )}
    </div>
  );
}
