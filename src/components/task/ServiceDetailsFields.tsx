import { getServiceFields, type Locale, type ServiceDetails } from "@/lib/serviceFields";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Props = {
  service: string | null | undefined;
  value: ServiceDetails;
  onChange: (next: ServiceDetails) => void;
  locale: Locale;
  invalidKey?: string | null;
};

export function ServiceDetailsFields({ service, value, onChange, locale, invalidKey }: Props) {
  const groups = getServiceFields(service);
  if (groups.length === 0) return null;
  const set = (k: string, v: ServiceDetails[string]) => onChange({ ...value, [k]: v });

  return (
    <div className="space-y-4" data-testid="service-details">
      {groups.map((g, gi) => (
        <div key={gi} className={g.title ? "rounded-xl border border-border p-3 space-y-3" : "space-y-3"}>
          {g.title && <p className="text-sm font-semibold">{g.title[locale]}</p>}
          {g.fields.map((f) => {
            if (f.showIf && !f.showIf(value)) return null;
            const id = `svc-${f.key}`;
            const invalid = invalidKey === f.key;
            const req = "required" in f && f.required;
            const label = (
              <label htmlFor={id} className="block text-sm font-medium mb-1.5">
                {f.label[locale]}{req && <span className="text-destructive"> *</span>}
              </label>
            );
            if (f.type === "boolean") {
              return (
                <div key={f.key} className="flex items-center justify-between gap-3 min-h-11">
                  <label htmlFor={id} className="text-sm font-medium">{f.label[locale]}</label>
                  <Switch id={id} checked={value[f.key] === true} onCheckedChange={(c) => set(f.key, c)} />
                </div>
              );
            }
            if (f.type === "select") {
              return (
                <div key={f.key}>
                  {label}
                  <Select value={(value[f.key] as string) || undefined} onValueChange={(v) => set(f.key, v)}>
                    <SelectTrigger id={id} className={`h-11 ${invalid ? "border-destructive" : ""}`}><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      {f.options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label[locale]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              );
            }
            if (f.type === "textarea") {
              return (
                <div key={f.key}>
                  {label}
                  <Textarea id={id} rows={3} maxLength={2000} value={(value[f.key] as string) ?? ""}
                    className={invalid ? "border-destructive" : ""} onChange={(e) => set(f.key, e.target.value)} />
                </div>
              );
            }
            return (
              <div key={f.key}>
                {label}
                <div className="flex items-center gap-2">
                  <Input id={id} className={`h-11 ${invalid ? "border-destructive" : ""}`}
                    type={f.type === "number" ? "number" : "text"} inputMode={f.type === "number" ? "numeric" : undefined}
                    min={f.type === "number" ? f.min : undefined} max={f.type === "number" ? f.max : undefined}
                    value={(value[f.key] as string | number | undefined) ?? ""}
                    onChange={(e) => set(f.key, f.type === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value)} />
                  {f.type === "number" && f.unit && <span className="text-sm text-muted-foreground">{f.unit[locale]}</span>}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
