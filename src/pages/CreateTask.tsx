import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "@/i18n/LanguageContext";
import { useGeolocation } from "@/hooks/useGeolocation";
import { LocationFallback } from "@/components/LocationFallback";
import { useAuth } from "@/hooks/useAuth";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { supabase } from "@/integrations/supabase/client";
import { useFormatPrice } from "@/hooks/useFormatPrice";
import { TaskAIAssistant } from "@/components/TaskAIAssistant";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Camera,
  Mic,
  MicOff,
  ArrowRight,
  ArrowLeft,
  MapPin,
  DollarSign,
  CheckCircle2,
  Sparkles,
  Loader2,
  X,
  ImagePlus,
  Play,
  Square,
  Trash2,
  Users,
  Zap,
  Rocket,
} from "lucide-react";

const DRAFT_KEY = "task_draft";
const categories = ["cleaning", "moving", "repair", "digital", "consulting", "delivery", "beauty", "tutoring"];

const CreateTaskPage = () => {
  const {
    latitude,
    longitude,
    loading: geoLoading,
    error: geoError,
    getCurrentLocation,
    permission: geoPermission,
    source: geoSource,
    label: geoLabel,
    searchAddress,
    setManualLocation,
    clearLocation,
    reverseGeocode,
  } = useGeolocation();
  const { t, currency, locale } = useLanguage();
  const formatPrice = useFormatPrice();
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const voice = useVoiceInput(locale);
  const audioRecorder = useAudioRecorder();
  const [step, setStep] = useState(1);
  const [categorizing, setCategorizing] = useState(false);
  const [voiceProcessing, setVoiceProcessing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [form, setForm] = useState(() => {
    const saved = localStorage.getItem(DRAFT_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          ...{
            category: "",
            taskType: "onsite" as "onsite" | "remote",
            title: "",
            description: "",
            budgetType: "fixed" as "fixed" | "range",
            budget: 100,
            budgetMax: 200,
            urgency: "flexible",
            location: "",
          },
          ...parsed,
        };
      } catch {
        /* ignore */
      }
    }
    return {
      category: "",
      taskType: "onsite" as "onsite" | "remote",
      title: "",
      description: "",
      budgetType: "fixed" as "fixed" | "range",
      budget: 100,
      budgetMax: 200,
      urgency: "flexible",
      location: "",
    };
  });

  const update = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  // Save draft to localStorage on form changes
  useEffect(() => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
  }, [form]);

  const aiContext = `Title: ${form.title}, Description: ${form.description}, Category: ${form.category}, Type: ${form.taskType}`;

  const handleAISuggestion = (text: string) => {
    update({ description: text });
    toast.success(t("task.ai.applied"));
  };

  const handlePhotos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (photos.length + files.length > 5) {
      toast.error(t("task.photos.max") || "Maximum 5 photos");
      return;
    }
    const validFiles = files.filter((f) => {
      if (f.size > 5 * 1024 * 1024) {
        toast.error(`${f.name}: max 5MB`);
        return false;
      }
      return f.type.startsWith("image/");
    });
    setPhotos((prev) => [...prev, ...validFiles]);
    validFiles.forEach((f) => {
      const reader = new FileReader();
      reader.onload = (ev) => setPhotoPreviews((prev) => [...prev, ev.target?.result as string]);
      reader.readAsDataURL(f);
    });
  };

  const removePhoto = (idx: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
    setPhotoPreviews((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleAutoCategorize = async () => {
    if (!form.description && !form.title) {
      toast.error(t("task.ai.needDescription"));
      return;
    }
    setCategorizing(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-task-assistant`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          type: "categorize",
          userLocale: locale,
          messages: [{ role: "user", content: `Task title: ${form.title}\nDescription: ${form.description}` }],
        }),
      });
      if (!resp.ok) throw new Error("Failed");
      const data = await resp.json();
      update({
        category: data.category || form.category,
        taskType: data.task_type || form.taskType,
        budget: data.budget_min || form.budget,
        budgetMax: data.budget_max || form.budgetMax,
        urgency: data.urgency || form.urgency,
        title: data.improved_title || form.title,
      });
      toast.success(t("task.ai.categorized"));
    } catch {
      toast.error(t("task.ai.error"));
    } finally {
      setCategorizing(false);
    }
  };

  const handleVoiceToTask = async () => {
    if (!voice.transcript && !form.description) {
      toast.error(t("task.voice.speakFirst") || "Record your voice first");
      return;
    }
    const text = voice.transcript || form.description;
    if (!text.trim()) return;

    setVoiceProcessing(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-task-assistant`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          type: "voice_to_task",
          userLocale: locale,
          messages: [{ role: "user", content: text }],
        }),
      });
      if (!resp.ok) throw new Error("Failed");
      const data = await resp.json();
      update({
        title: data.title || form.title,
        description: data.description || form.description,
        category: data.category || form.category,
        budget: data.budget || form.budget,
        taskType: data.task_type || form.taskType,
        location: data.location || form.location,
      });
      toast.success(t("task.voice.taskCreated") || "Task structured from voice!");
      setStep(2); // Jump to details step to review
    } catch {
      toast.error(t("task.ai.error"));
    } finally {
      setVoiceProcessing(false);
    }
  };

  const [showMotivation, setShowMotivation] = useState(false);

  const [geoPrompt, setGeoPrompt] = useState<{ open: boolean; address: string | null }>({
    open: false,
    address: null,
  });
  const [geoAutoTried, setGeoAutoTried] = useState(false);
  // Choice dialog: "use my current location" vs. "enter manually"
  const [geoChoice, setGeoChoice] = useState<{ open: boolean; resolving: boolean }>({
    open: false,
    resolving: false,
  });
  const [addressGeocoding, setAddressGeocoding] = useState(false);
  // Tracks the address string for which the current lat/lng were geocoded,
  // so we know if the user changed the address since the last geocode.
  const [geocodedFor, setGeocodedFor] = useState<string | null>(null);

  /** Forward-geocode the address the user typed in, so the saved task has
   *  coordinates that actually match its address. */
  const geocodeTypedAddress = useCallback(
    async (q: string) => {
      const query = q.trim();
      if (!query) return;
      if (geocodedFor === query) return;
      setAddressGeocoding(true);
      try {
        const r = await searchAddress(query);
        if (r) {
          setGeocodedFor(query);
          // Keep the user's typed text but normalize coords via setManualLocation
          // (searchAddress already calls setManualLocation internally with display_name)
        }
      } finally {
        setAddressGeocoding(false);
      }
    },
    [geocodedFor, searchAddress]
  );

  // On entering step 2 (address step) — ask the user how they want to set the address
  useEffect(() => {
    if (step !== 2) return;
    if (geoAutoTried) return;
    if (form.taskType === "remote") return;
    if (form.location.trim()) return;
    setGeoAutoTried(true);
    setGeoChoice({ open: true, resolving: false });
  }, [step, geoAutoTried, form.taskType, form.location]);

  // When coords arrive after the user picked "use current location",
  // reverse-geocode them and write the result into the address field.
  useEffect(() => {
    if (!geoChoice.resolving) return;
    if (geoSource !== "gps") return;
    if (latitude == null || longitude == null) return;
    let cancelled = false;
    (async () => {
      const address = await reverseGeocode(latitude, longitude, locale);
      if (cancelled) return;
      const resolved = address ?? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
      update({ location: resolved });
      setGeocodedFor(resolved);
      setGeoChoice({ open: false, resolving: false });
      toast.success(t("task.geo.applied") || "Адрес определён");
    })();
    return () => {
      cancelled = true;
    };
  }, [geoChoice.resolving, latitude, longitude, geoSource, reverseGeocode, locale, t]);

  const handleSubmit = async () => {
    if (!user) {
      setShowMotivation(true);
      return;
    }
    if (!form.title.trim()) {
      toast.error(t("task.title.required") || "Title is required");
      return;
    }

    setSubmitting(true);
    try {
      // Make sure coordinates match the address typed in by the user.
      // If the user typed an address but never triggered geocoding, do it now.
      let finalLat: number | null = latitude ?? null;
      let finalLng: number | null = longitude ?? null;
      if (form.taskType === "remote") {
        finalLat = null;
        finalLng = null;
      } else {
        const typed = form.location.trim();
        if (typed && (geocodedFor !== typed || finalLat == null || finalLng == null)) {
          try {
            const r = await searchAddress(typed);
            if (r) {
              finalLat = r.lat;
              finalLng = r.lng;
            }
          } catch {
            // Non-fatal — we'll still publish with whatever coords we have.
          }
        }
      }

      // Upload photos
      const photoUrls: string[] = [];
      for (const file of photos) {
        const ext = file.name.split(".").pop();
        const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage.from("task-photos").upload(path, file);
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from("task-photos").getPublicUrl(path);
        photoUrls.push(urlData.publicUrl);
      }

      // Upload voice note
      let voiceNoteUrl: string | null = null;
      if (audioRecorder.audioBlob) {
        const voicePath = `${user.id}/${crypto.randomUUID()}.webm`;
        const { error: voiceError } = await supabase.storage
          .from("voice-notes")
          .upload(voicePath, audioRecorder.audioBlob, { contentType: "audio/webm" });
        if (voiceError) throw voiceError;
        const { data: voiceUrlData } = supabase.storage.from("voice-notes").getPublicUrl(voicePath);
        voiceNoteUrl = voiceUrlData.publicUrl;
      }

      let categoryId: string | null = null;
      if (form.category) {
        const { data: catData } = await supabase
          .from("categories")
          .select("id")
          .eq("name_en", form.category.charAt(0).toUpperCase() + form.category.slice(1))
          .maybeSingle();

        if (!catData) {
          // Try matching by lowercase name_en
          const { data: catData2 } = await supabase
            .from("categories")
            .select("id")
            .ilike("name_en", `%${form.category}%`)
            .maybeSingle();
          categoryId = catData2?.id || null;
        } else {
          categoryId = catData.id;
        }
      }

      const { error } = await supabase.from("tasks").insert({
        latitude: finalLat,
        longitude: finalLng,
        user_id: user.id,
        title: form.title.trim(),
        description: form.description.trim() || null,
        category_id: categoryId,
        task_type: form.taskType as "onsite" | "remote",
        budget_fixed: form.budget,
        budget_min: form.budget,
        budget_max: form.budgetMax,
        is_urgent: form.urgency === "urgent",
        address: form.location.trim() || null,
        photos: photoUrls.length > 0 ? photoUrls : null,
        voice_note_url: voiceNoteUrl,
        status: "open",
        currency,
      });

      if (error) throw error;

      localStorage.removeItem(DRAFT_KEY);
      toast.success(t("task.published") || "Task published!");
      navigate("/tasks");
    } catch (err: unknown) {
      console.error("Submit error:", err);
      const message =
        err instanceof Error
          ? err.message
          : typeof err === "object" &&
              err !== null &&
              "message" in err &&
              typeof (err as { message: unknown }).message === "string"
            ? (err as { message: string }).message
            : null;
      toast.error(message || t("task.publish.error") || "Failed to publish task");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[80vh] py-12">
      <div className="container max-w-2xl">
        <h1 className="text-2xl font-bold mb-8">{t("task.create.title")}</h1>

        {/* Progress */}
        <div className="flex items-center gap-2 mb-10">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex-1 flex items-center gap-2">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                  step >= s ? "bg-gradient-emerald text-primary-foreground" : "bg-secondary text-muted-foreground"
                }`}
              >
                {step > s ? <CheckCircle2 className="w-4 h-4" /> : s}
              </div>
              {s < 3 && <div className={`flex-1 h-0.5 rounded ${step > s ? "bg-primary" : "bg-border"}`} />}
            </div>
          ))}
        </div>

        <motion.div
          key={step}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
        >
          {step === 1 && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (audioRecorder.isRecording) {
                      audioRecorder.stop();
                      if (voice.isListening) {
                        voice.stop();
                        if (voice.transcript) {
                          update({ description: (form.description ? form.description + " " : "") + voice.transcript });
                          toast.success(t("task.voice.applied") || "Voice text added!");
                          voice.reset();
                        }
                      }
                      toast.success(t("task.voice.recorded") || "Voice note recorded!");
                    } else {
                      audioRecorder.start();
                      if (voice.isSupported) {
                        voice.start();
                      }
                    }
                  }}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${
                    audioRecorder.isRecording
                      ? "border-destructive bg-destructive/10 text-destructive animate-pulse"
                      : "border-border hover:shadow-card-hover bg-orange-50 text-orange-600"
                  }`}
                >
                  {audioRecorder.isRecording ? <Square className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                  <span className="text-xs font-medium">
                    {audioRecorder.isRecording
                      ? `${Math.floor(audioRecorder.duration / 60)}:${String(audioRecorder.duration % 60).padStart(2, "0")}`
                      : t("task.voice")}
                  </span>
                </button>
                <TaskAIAssistant onApplySuggestion={handleAISuggestion} context={aiContext} />
              </div>

              {/* Voice transcript & audio preview */}
              <AnimatePresence>
                {audioRecorder.isRecording && voice.transcript && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="bg-muted rounded-xl p-3 text-sm text-foreground border border-border"
                  >
                    <p className="text-xs text-muted-foreground mb-1">{t("task.voice.preview") || "Voice input:"}</p>
                    <p>{voice.transcript}</p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Voice to Task AI button */}
              {(voice.transcript || audioRecorder.audioUrl) && !audioRecorder.isRecording && (
                <button
                  type="button"
                  onClick={handleVoiceToTask}
                  disabled={voiceProcessing}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold bg-gradient-emerald text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {voiceProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {t("task.voice.createTask") || "✨ Create task from voice"}
                </button>
              )}
              {audioRecorder.audioUrl && !audioRecorder.isRecording && (
                <div className="flex items-center gap-3 bg-muted rounded-xl p-3 border border-border">
                  <Play className="w-4 h-4 text-muted-foreground shrink-0" />
                  <audio src={audioRecorder.audioUrl} controls className="flex-1 h-8" />
                  <button
                    type="button"
                    onClick={() => audioRecorder.reset()}
                    className="text-destructive hover:text-destructive/80"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-2">{t("task.category")}</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {categories.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => update({ category: c })}
                      className={`py-2.5 px-3 rounded-xl border text-sm font-medium transition-all ${
                        form.category === c
                          ? "border-primary bg-emerald-50 text-primary"
                          : "border-border text-muted-foreground hover:border-primary/30"
                      }`}
                    >
                      {t(`cat.${c}`)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">{t("task.type")}</label>
                <div className="flex gap-2">
                  {(["onsite", "remote"] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => update({ taskType: type })}
                      className={`flex-1 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                        form.taskType === type
                          ? "border-primary bg-emerald-50 text-primary"
                          : "border-border text-muted-foreground"
                      }`}
                    >
                      {t(`task.type.${type}`)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium mb-1.5">{t("task.title")}</label>
                <input
                  value={form.title}
                  onChange={(e) => update({ title: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  placeholder={t("task.title.placeholder")}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">{t("task.description")}</label>
                <textarea
                  value={form.description}
                  onChange={(e) => update({ description: e.target.value })}
                  rows={4}
                  className="w-full px-4 py-2.5 rounded-xl border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                  placeholder={t("task.description.placeholder")}
                />
              </div>

              <button
                type="button"
                onClick={handleAutoCategorize}
                disabled={categorizing}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-primary/30 text-sm font-medium text-primary hover:bg-primary/5 transition-colors disabled:opacity-50"
              >
                {categorizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {t("task.ai.autoCategorize")}
              </button>

              <div>
                <label className="block text-sm font-medium mb-1.5">{t("task.location")}</label>
                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    onClick={getCurrentLocation}
                    className="px-3 py-2 rounded-lg border text-xs hover:bg-secondary"
                  >
                    {geoLoading ? "Определяем..." : "📍 Моя геолокация"}
                  </button>
                </div>
                {geoLoading && !form.location && (
                  <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    {t("task.geo.detecting")}
                  </p>
                )}

                <LocationFallback
                  error={geoError}
                  permission={geoPermission}
                  source={geoSource}
                  label={geoLabel}
                  loading={geoLoading}
                  onSearchAddress={async (q) => {
                    const r = await searchAddress(q);
                    if (r) update({ location: r.label });
                    return r;
                  }}
                  onPickCity={(lat, lng, name) => {
                    setManualLocation(lat, lng, name);
                    update({ location: name });
                  }}
                  onClear={clearLocation}
                />

                {latitude && longitude && geoSource !== "manual" && (
                  <p className="text-xs text-muted-foreground mt-1">
                    📍 {latitude.toFixed(5)}, {longitude.toFixed(5)}
                  </p>
                )}
                <div className="relative">
                  <MapPin className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    value={form.location}
                    onChange={(e) => update({ location: e.target.value })}
                    onBlur={(e) => {
                      // After the user finishes typing an address, resolve it to
                      // coordinates so the saved task carries an accurate geo point.
                      if (form.taskType !== "remote") {
                        void geocodeTypedAddress(e.target.value);
                      }
                    }}
                    className="w-full ps-10 pe-4 py-2.5 rounded-xl border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    placeholder={t("task.location.placeholder")}
                  />
                  {addressGeocoding && (
                    <Loader2 className="absolute end-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5">{t("task.budget")}</label>
                  <div className="relative">
                    <DollarSign className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="number"
                      value={form.budget}
                      onChange={(e) => update({ budget: Number(e.target.value) })}
                      className="w-full ps-10 pe-4 py-2.5 rounded-xl border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    ≈ {formatPrice(form.budget, currency === "USD" ? "ILS" : "USD")}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">{t("task.urgency")}</label>
                  <select
                    value={form.urgency}
                    onChange={(e) => update({ urgency: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  >
                    <option value="flexible">{t("task.urgency.flexible")}</option>
                    <option value="soon">{t("task.urgency.soon")}</option>
                    <option value="urgent">{t("task.urgency.urgent")}</option>
                  </select>
                </div>
              </div>

              {/* Photo upload */}
              <div>
                <label className="block text-sm font-medium mb-1.5">{t("task.photos")}</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handlePhotos}
                />

                {photoPreviews.length > 0 && (
                  <div className="flex flex-wrap gap-3 mb-3">
                    {photoPreviews.map((src, i) => (
                      <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden border border-border">
                        <img src={src} alt="" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removePhoto(i)}
                          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={photos.length >= 5}
                  className="w-full border-2 border-dashed border-border rounded-xl p-6 text-center hover:border-primary/30 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ImagePlus className="w-8 h-8 mx-auto text-muted-foreground" />
                  <p className="text-sm text-muted-foreground mt-2">
                    {t("task.photos.upload") || "Click to upload photos"} ({photos.length}/5)
                  </p>
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="bg-card rounded-2xl border border-border p-6 space-y-3">
                <h3 className="font-bold text-lg">{form.title || "—"}</h3>
                <p className="text-sm text-muted-foreground">{form.description || "—"}</p>
                <div className="flex flex-wrap gap-3 text-sm">
                  <span className="bg-emerald-50 text-primary px-3 py-1 rounded-full font-medium">
                    {form.category ? t(`cat.${form.category}`) : "—"}
                  </span>
                  <span className="bg-secondary text-foreground px-3 py-1 rounded-full">
                    {t(`task.type.${form.taskType}`)}
                  </span>
                  <span className="bg-secondary text-foreground px-3 py-1 rounded-full">
                    {formatPrice(form.budget, currency)}
                  </span>
                </div>
                {form.location && (
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <MapPin className="w-4 h-4" />
                    {form.location}
                  </div>
                )}
                {photoPreviews.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-2">
                    {photoPreviews.map((src, i) => (
                      <img
                        key={i}
                        src={src}
                        alt=""
                        className="w-16 h-16 rounded-lg object-cover border border-border"
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </motion.div>

        {/* Navigation */}
        <div className="flex justify-between mt-8">
          {step > 1 ? (
            <button
              onClick={() => setStep(step - 1)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-secondary transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              {t("task.back")}
            </button>
          ) : (
            <div />
          )}
          {step < 3 ? (
            <button
              onClick={() => setStep(step + 1)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold bg-accent text-accent-foreground hover:opacity-90 transition-opacity"
            >
              {t("task.next")}
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold bg-accent text-accent-foreground shadow-trust hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {t("task.submit")}
            </button>
          )}
        </div>

        {/* Geolocation choice modal: use current location or enter manually */}
        <AnimatePresence>
          {geoChoice.open && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
              onClick={() => !geoChoice.resolving && setGeoChoice({ open: false, resolving: false })}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-card rounded-2xl p-6 max-w-sm w-full text-center space-y-4 shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center mx-auto">
                  <MapPin className="w-7 h-7 text-primary" />
                </div>
                <h2 className="text-lg font-bold text-foreground">
                  {t("task.geo.chooseTitle") || "Адрес выполнения задачи"}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {t("task.geo.chooseDesc") ||
                    "Использовать вашу текущую геолокацию как адрес или ввести его вручную?"}
                </p>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    disabled={geoChoice.resolving}
                    onClick={() => {
                      setGeoChoice({ open: true, resolving: true });
                      getCurrentLocation();
                    }}
                    className="w-full py-2.5 rounded-xl font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    {geoChoice.resolving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {t("task.geo.detecting") || "Определяем..."}
                      </>
                    ) : (
                      <>📍 {t("task.geo.useCurrent") || "Использовать текущую"}</>
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={geoChoice.resolving}
                    onClick={() => setGeoChoice({ open: false, resolving: false })}
                    className="w-full py-2.5 rounded-xl font-medium border border-border text-foreground hover:bg-secondary transition-colors disabled:opacity-60"
                  >
                    {t("task.geo.enterManually") || "Ввести вручную"}
                  </button>
                </div>
                {geoError && geoChoice.resolving && (
                  <p className="text-xs text-destructive">{geoError}</p>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Motivational pre-login modal */}
        <AnimatePresence>
          {showMotivation && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
              onClick={() => setShowMotivation(false)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-card rounded-2xl p-8 max-w-sm w-full text-center space-y-5 shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto">
                  <Users className="w-8 h-8 text-primary" />
                </div>
                <h2 className="text-xl font-bold text-foreground">{t("motivation.readyTitle")}</h2>
                <div className="space-y-3">
                  <div className="flex items-center gap-3 text-start bg-secondary rounded-xl p-3">
                    <Zap className="w-5 h-5 text-amber-500 shrink-0" />
                    <p className="text-sm font-medium">{t("motivation.taskers")}</p>
                  </div>
                  <div className="flex items-center gap-3 text-start bg-secondary rounded-xl p-3">
                    <Rocket className="w-5 h-5 text-primary shrink-0" />
                    <p className="text-sm font-medium">{t("motivation.speed")}</p>
                  </div>
                  <div className="flex items-center gap-3 text-start bg-secondary rounded-xl p-3">
                    <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
                    <p className="text-sm font-medium">{t("motivation.saved")}</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowMotivation(false);
                    navigate("/login?tab=signup&returnTo=/create-task");
                  }}
                  className="w-full py-3 rounded-xl font-bold text-base bg-accent text-accent-foreground shadow-trust hover:opacity-90 transition-opacity"
                >
                  {t("motivation.cta")}
                </button>
                <p className="text-xs text-muted-foreground">{t("motivation.note")}</p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default CreateTaskPage;
