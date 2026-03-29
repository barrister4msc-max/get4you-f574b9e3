import { useState, useRef, useEffect } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
import { useVoiceInput } from '@/hooks/useVoiceInput';
import { streamChat } from '@/lib/streamChat';
import { Bot, Send, X, Sparkles, Mic, MicOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type Msg = { role: 'user' | 'assistant'; content: string };

interface Props {
  onApplySuggestion?: (text: string) => void;
  context?: string;
}

export const TaskAIAssistant = ({ onApplySuggestion, context }: Props) => {
  const { t, locale } = useLanguage();
  const voice = useVoiceInput(locale);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg: Msg = { role: 'user', content: input };
    const contextMsg = context ? `[Current task context: ${context}]\n\n${input}` : input;
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    let assistantSoFar = '';
    const updateAssistant = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant') {
          return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantSoFar } : m);
        }
        return [...prev, { role: 'assistant', content: assistantSoFar }];
      });
    };

    await streamChat({
      functionName: 'ai-task-assistant',
      messages: [{ role: 'user', content: contextMsg }],
      extraBody: { type: 'assist' },
      onDelta: updateAssistant,
      onDone: () => setLoading(false),
      onError: (err) => {
        setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ ${err}` }]);
        setLoading(false);
      },
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border hover:shadow-card-hover transition-all bg-purple-50 text-purple-600"
      >
        <Sparkles className="w-6 h-6" />
        <span className="text-xs font-medium">{t('task.ai')}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="mt-3 border border-border rounded-2xl bg-card overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">{t('task.ai')}</span>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div ref={scrollRef} className="h-48 overflow-y-auto p-3 space-y-2">
              {messages.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">
                  {t('task.ai.hint') || 'Describe your task and I\'ll help you improve it'}
                </p>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] text-sm px-3 py-2 rounded-xl ${
                      m.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-foreground'
                    }`}
                  >
                    {m.content}
                    {m.role === 'assistant' && onApplySuggestion && (
                      <button
                        type="button"
                        onClick={() => onApplySuggestion(m.content)}
                        className="block text-xs text-primary mt-1 hover:underline"
                      >
                        ↳ Apply
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2 p-3 border-t border-border">
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && send()}
                placeholder="..."
                className="flex-1 text-sm px-3 py-2 rounded-lg border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
              <button
                type="button"
                onClick={() => {
                  if (!voice.isSupported) return;
                  if (voice.isListening) {
                    voice.stop();
                    if (voice.transcript) {
                      setInput(prev => (prev ? prev + ' ' : '') + voice.transcript);
                      voice.reset();
                    }
                  } else {
                    voice.start((text) => {
                      setInput(text);
                    });
                  }
                }}
                disabled={!voice.isSupported}
                className={`p-2 rounded-lg transition-colors disabled:opacity-30 ${
                  voice.isListening
                    ? 'bg-destructive text-destructive-foreground animate-pulse'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                {voice.isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={send}
                disabled={loading || !input.trim()}
                className="p-2 rounded-lg bg-primary text-primary-foreground disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
