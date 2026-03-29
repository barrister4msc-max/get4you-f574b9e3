import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useLanguage } from '@/i18n/LanguageContext';
import { formatPrice } from '@/components/CurrencyToggle';
import { supabase } from '@/integrations/supabase/client';
import { MapPin, Clock, User, Star, Shield, ArrowRight, Play, ImageIcon } from 'lucide-react';

const TaskDetailPage = () => {
  const { id } = useParams();
  const { t, currency, locale } = useLanguage();
  const [task, setTask] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  useEffect(() => {
    const fetchTask = async () => {
      if (!id) return;
      const { data } = await supabase
        .from('tasks')
        .select('*, categories(name_en, name_ru, name_he), profiles!tasks_user_id_fkey1(display_name, avatar_url)')
        .eq('id', id)
        .maybeSingle();
      setTask(data);
      setLoading(false);
    };
    fetchTask();
  }, [id]);

  if (loading) {
    return (
      <div className="py-8">
        <div className="container max-w-4xl text-center text-muted-foreground py-20">Loading...</div>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="py-8">
        <div className="container max-w-4xl text-center text-muted-foreground py-20">{t('tasks.noResults')}</div>
      </div>
    );
  }

  const catName = task.categories
    ? locale === 'ru' ? task.categories.name_ru || task.categories.name_en
    : locale === 'he' ? task.categories.name_he || task.categories.name_en
    : task.categories.name_en
    : null;

  const budget = task.budget_fixed || task.budget_min || 0;
  const photos: string[] = task.photos || [];
  const ownerName = task.profiles?.display_name || 'User';

  return (
    <div className="py-8">
      <div className="container max-w-4xl">
        <div className="grid md:grid-cols-3 gap-6">
          {/* Main */}
          <div className="md:col-span-2 space-y-6">
            <div className="bg-card border border-border rounded-2xl p-6">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                {catName && (
                  <span className="bg-emerald-50 text-primary text-xs font-semibold px-2.5 py-1 rounded-full">
                    {catName}
                  </span>
                )}
                {task.is_urgent && (
                  <span className="bg-red-50 text-red-600 text-xs font-medium px-2.5 py-1 rounded-full">
                    {t('task.urgency.urgent')}
                  </span>
                )}
                {task.task_type && (
                  <span className="bg-secondary text-muted-foreground text-xs px-2.5 py-1 rounded-full">
                    {t(`task.type.${task.task_type}`)}
                  </span>
                )}
              </div>
              <h1 className="text-xl font-bold">{task.title}</h1>
              {task.description && (
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{task.description}</p>
              )}

              <div className="flex flex-wrap gap-4 mt-4 text-sm text-muted-foreground">
                {(task.city || task.address) && (
                  <span className="flex items-center gap-1"><MapPin className="w-4 h-4" />{task.city || task.address}</span>
                )}
                <span className="flex items-center gap-1"><Clock className="w-4 h-4" />{new Date(task.created_at).toLocaleDateString()}</span>
              </div>

              {/* Photos gallery */}
              {photos.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {/* Main selected photo */}
                  <div className="rounded-xl overflow-hidden border border-border bg-secondary">
                    <img
                      src={selectedPhoto || photos[0]}
                      alt=""
                      className="w-full h-64 object-cover cursor-pointer"
                      onClick={() => window.open(selectedPhoto || photos[0], '_blank')}
                    />
                  </div>
                  {/* Thumbnails */}
                  {photos.length > 1 && (
                    <div className="flex gap-2 overflow-x-auto">
                      {photos.map((url, i) => (
                        <button
                          key={i}
                          onClick={() => setSelectedPhoto(url)}
                          className={`w-16 h-16 rounded-lg overflow-hidden border-2 shrink-0 transition-colors ${
                            (selectedPhoto || photos[0]) === url ? 'border-primary' : 'border-border'
                          }`}
                        >
                          <img src={url} alt="" className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-4 bg-secondary rounded-xl h-40 flex items-center justify-center text-sm text-muted-foreground">
                  <ImageIcon className="w-8 h-8 text-muted-foreground" />
                </div>
              )}

              {/* Voice note */}
              {task.voice_note_url && (
                <div className="mt-4 flex items-center gap-3 bg-muted rounded-xl p-3 border border-border">
                  <Play className="w-4 h-4 text-muted-foreground shrink-0" />
                  <audio src={task.voice_note_url} controls className="flex-1 h-8" />
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-2xl p-5 sticky top-20">
              <div className="text-2xl font-bold text-primary">{formatPrice(budget, currency)}</div>
              <p className="text-xs text-muted-foreground mt-1">{t('task.budget')}</p>

              <button className="w-full mt-4 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold bg-accent text-accent-foreground shadow-trust hover:opacity-90 transition-opacity">
                {t('tasks.respond')}
                <ArrowRight className="w-4 h-4" />
              </button>

              <div className="mt-5 pt-5 border-t border-border">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center">
                    <User className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div>
                    <div className="font-semibold text-sm">{ownerName}</div>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2 text-xs text-primary font-medium">
                <Shield className="w-4 h-4" />
                Escrow protected
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TaskDetailPage;
