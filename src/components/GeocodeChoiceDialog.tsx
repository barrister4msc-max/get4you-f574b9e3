import { MapPin } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { geocodeChoiceStore, useGeocodeChoice } from "@/lib/geocodeChoice";
import { useLanguage } from "@/i18n/LanguageContext";

export function GeocodeChoiceDialog() {
  const { open, candidates, query } = useGeocodeChoice();
  const { t } = useLanguage();

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) geocodeChoiceStore.cancel(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("geocode.chooseTitle") || "Choose the closest match"}</DialogTitle>
          <DialogDescription>
            {(t("geocode.chooseDesc") || "Found several matches for") + ` “${query}”`}
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-1.5 max-h-[50vh] overflow-y-auto">
          {candidates.map((c, idx) => (
            <li key={`${c.lat}-${c.lng}-${idx}`}>
              <button
                type="button"
                onClick={() => geocodeChoiceStore.pick(idx)}
                className="w-full text-start flex items-start gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-secondary transition-colors"
              >
                <MapPin className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <span className="flex-1">{c.label}</span>
              </button>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={() => geocodeChoiceStore.cancel()}>
            {t("common.cancel") || "Cancel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default GeocodeChoiceDialog;