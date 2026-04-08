import { useState, useEffect } from 'react';
import { getCachedTranslation, setCachedTranslations, makeKey, isTranslatedCopyUsable } from '@/lib/translationCache';
import { Link } from 'react-router-dom';
import { useLanguage } from '@/i18n/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { useFormatPrice } from '@/hooks/useFormatPrice';
import { supabase } from '@/integrations/supabase/client';
import { motion } from 'framer-motion';
import { MapPin, Clock, Search, ImageIcon, SlidersHorizontal, X, Navigation } from 'lucide-react';
import type { Locale } from '@/i18n/translations';
...
  const getDisplayedTaskCopy = (task: TaskRow): TranslatedTaskCopy => {
    const key = makeKey(locale, task.id);
    const inState = translatedTasks[key];
    if (isTranslatedCopyUsable(locale, task.title, task.description, inState)) {
      return inState;
    }

    const cached = getCachedTranslation(locale, task.id);
    if (isTranslatedCopyUsable(locale, task.title, task.description, cached)) {
      return { title: cached!.title, description: cached!.description };
    }

    return { title: task.title, description: task.description };
  };

  useEffect(() => {
    const fromCache: Record<string, TranslatedTaskCopy> = {};
    for (const task of tasksForCurrentTab) {
      const key = makeKey(locale, task.id);
      if (!isTranslatedCopyUsable(locale, task.title, task.description, translatedTasks[key])) {
        const cached = getCachedTranslation(locale, task.id);
        if (isTranslatedCopyUsable(locale, task.title, task.description, cached)) {
          fromCache[key] = { title: cached!.title, description: cached!.description };
        }
      }
    }
    if (Object.keys(fromCache).length > 0) {
      setTranslatedTasks((prev) => ({ ...prev, ...fromCache }));
    }
  }, [locale, tasksForCurrentTab, translatedTasks]);

  useEffect(() => {
    const tasksNeedingTranslation = tasksForCurrentTab
      .filter((task) => task.title || task.description)
      .filter((task) => {
        const key = makeKey(locale, task.id);
        return !isTranslatedCopyUsable(locale, task.title, task.description, translatedTasks[key])
          && !isTranslatedCopyUsable(locale, task.title, task.description, getCachedTranslation(locale, task.id));
      });

    if (tasksNeedingTranslation.length === 0) return;

    let cancelled = false;

    const translateTasks = async () => {
      const { data, error } = await supabase.functions.invoke('ai-task-assistant', {
        body: {
          type: 'translate_tasks',
          targetLocale: locale,
          tasks: tasksNeedingTranslation.map(({ id, title, description }) => ({ id, title, description })),
        },
      });

      if (cancelled || error || !data?.translations) return;

      const validTranslations = (data.translations as TaskTranslationResult[])
        .map((translation) => {
          const originalTask = tasksNeedingTranslation.find((task) => task.id === translation.id);
          if (!originalTask) return null;

          const nextCopy: TaskTranslationResult = {
            id: translation.id,
            title: translation.title || originalTask.title,
            description: translation.description ?? originalTask.description,
          };

          return isTranslatedCopyUsable(locale, originalTask.title, originalTask.description, nextCopy)
            ? nextCopy
            : null;
        })
        .filter((translation): translation is TaskTranslationResult => Boolean(translation));

      if (validTranslations.length === 0) return;

      setCachedTranslations(locale, validTranslations);
      setTranslatedTasks((prev) => {
        const next = { ...prev };
        validTranslations.forEach((translation) => {
          next[makeKey(locale, translation.id)] = {
            title: translation.title,
            description: translation.description,
          };
        });
        return next;
      });
    };

    translateTasks().catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [locale, tasksForCurrentTab, translatedTasks]);

  const getTaskDistance = (task: TaskRow): number | null => {
    if (!userCoords || !task.latitude || !task.longitude) return null;
    return getDistanceKm(userCoords.lat, userCoords.lng, task.latitude, task.longitude);
  };

  const filtered = tasks.filter((task) => {
    if (filterCat && task.category_id !== filterCat) return false;
    if (search) {
      const displayedCopy = getDisplayedTaskCopy(task);
      const query = search.toLowerCase();
      const matches = [task.title, task.description || '', displayedCopy.title, displayedCopy.description || '']
        .some((value) => value.toLowerCase().includes(query));
      if (!matches) return false;
    }
    if (filterCity && task.city !== filterCity) return false;
    const budget = task.budget_fixed || task.budget_min || 0;
    if (filterBudgetMin && budget < Number(filterBudgetMin)) return false;
    if (filterBudgetMax && budget > Number(filterBudgetMax)) return false;
    if (filterRadius && userCoords) {
      const dist = getTaskDistance(task);
      if (dist === null) return true; // show tasks without coords
      if (dist > Number(filterRadius)) return false;
    }
    return true;
  });

  const activeFilters = [filterCat, filterCity, filterBudgetMin, filterBudgetMax, filterRadius].filter(Boolean).length;

  const clearFilters = () => {
    setFilterCat('');
    setFilterCity('');
    setFilterBudgetMin('');
    setFilterBudgetMax('');
    setFilterRadius('');
    setSearch('');
  };

  const displayTasks = tab === 'my' ? myTasks : filtered;

  return (
    <div className="py-8">
      <div className="container">
        <h1 className="text-2xl font-bold mb-6">{t('tasks.title')}</h1>

        {isTasker && (
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setTab('all')}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                tab === 'all' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'
              }`}
            >
              {t('tasks.allTasks')}
            </button>
            <button
              onClick={() => setTab('my')}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                tab === 'my' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'
              }`}
            >
              {t('nav.myTasks')} ({myTasks.length})
            </button>
          </div>
        )}

        {tab === 'all' && (
          <>
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <div className="relative flex-1">
                <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full ps-10 pe-4 py-2.5 rounded-xl border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  placeholder={t('general.search')}
                />
              </div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                  showFilters || activeFilters > 0
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-input bg-card text-muted-foreground hover:text-foreground'
                }`}
              >
                <SlidersHorizontal className="w-4 h-4" />
                {t('tasks.filter')}
                {activeFilters > 0 && (
                  <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">
                    {activeFilters}
                  </span>
                )}
              </button>
            </div>

            {showFilters && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-6 p-4 rounded-2xl border border-border bg-card space-y-3"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1 text-muted-foreground">{t('task.category')}</label>
                    <select
                      value={filterCat}
                      onChange={(e) => setFilterCat(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    >
                      <option value="">{t('tasks.allTasks')}</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {locale === 'ru' ? c.name_ru || c.name_en : locale === 'he' ? c.name_he || c.name_en : c.name_en}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1 text-muted-foreground">{t('profile.city')}</label>
                    <select
                      value={filterCity}
                      onChange={(e) => setFilterCity(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    >
                      <option value="">{t('tasks.allTasks')}</option>
                      {cities.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1 text-muted-foreground">{t('tasks.filter.budgetFrom')}</label>
                    <input
                      type="number"
                      value={filterBudgetMin}
                      onChange={(e) => setFilterBudgetMin(e.target.value)}
                      placeholder={currency === 'ILS' ? '₪' : '$'}
                      className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1 text-muted-foreground">{t('tasks.filter.budgetTo')}</label>
                    <input
                      type="number"
                      value={filterBudgetMax}
                      onChange={(e) => setFilterBudgetMax(e.target.value)}
                      placeholder={currency === 'ILS' ? '₪' : '$'}
                      className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1 text-muted-foreground">{t('tasks.filter.radius')}</label>
                    <div className="flex gap-1">
                      <select
                        value={filterRadius}
                        onChange={(e) => {
                          setFilterRadius(e.target.value);
                          if (e.target.value && !userCoords) requestGeolocation();
                        }}
                        className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      >
                        <option value="">{t('tasks.filter.anyDistance')}</option>
                        {RADIUS_OPTIONS.map((r) => (
                          <option key={r} value={r}>{r} km</option>
                        ))}
                      </select>
                      {!userCoords && (
                        <button
                          onClick={requestGeolocation}
                          disabled={geoLoading}
                          className="shrink-0 px-2 py-2 rounded-xl border border-input bg-background hover:bg-secondary transition-colors"
                          title={t('tasks.filter.detectLocation')}
                        >
                          <Navigation className={`w-4 h-4 ${geoLoading ? 'animate-pulse text-primary' : 'text-muted-foreground'}`} />
                        </button>
                      )}
                    </div>
                    {userCoords && (
                      <p className="text-[10px] text-primary mt-0.5 flex items-center gap-1">
                        <Navigation className="w-2.5 h-2.5" />
                        {t('tasks.filter.locationDetected')}
                      </p>
                    )}
                  </div>
                </div>
                {activeFilters > 0 && (
                  <button
                    onClick={clearFilters}
                    className="flex items-center gap-1 text-xs text-destructive hover:underline"
                  >
                    <X className="w-3 h-3" />
                    {t('tasks.filter.clear')}
                  </button>
                )}
              </motion.div>
            )}
          </>
        )}

        <div className="grid gap-4">
          {loading && <p className="text-center text-muted-foreground py-12">{t('dashboard.loading')}</p>}
          {!loading && displayTasks.length === 0 && (
            <p className="text-center text-muted-foreground py-12">
              {tab === 'my' ? t('tasks.noMyTasks') : t('tasks.noResults')}
            </p>
          )}
          {displayTasks.map((task, i) => (
            <TaskCard
              key={task.id}
              task={task}
              i={i}
              currency={currency}
              t={t}
              getCategoryName={getCategoryName}
              showStatus={tab === 'my'}
              distanceKm={tab === 'all' ? getTaskDistance(task) : null}
              displayTitle={getDisplayedTaskCopy(task).title}
              displayDescription={getDisplayedTaskCopy(task).description}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default TasksPage;
