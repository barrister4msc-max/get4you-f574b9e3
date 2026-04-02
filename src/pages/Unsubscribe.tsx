import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/i18n/LanguageContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";

const Unsubscribe = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const { t } = useLanguage();

  const [status, setStatus] = useState<"loading" | "valid" | "already" | "invalid" | "success" | "error">("loading");

  useEffect(() => {
    if (!token) {
      setStatus("invalid");
      return;
    }

    const validate = async () => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/handle-email-unsubscribe?token=${token}`,
          { headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } }
        );
        const data = await res.json();
        if (res.ok && data.valid) {
          setStatus("valid");
        } else if (data.reason === "already_unsubscribed") {
          setStatus("already");
        } else {
          setStatus("invalid");
        }
      } catch {
        setStatus("invalid");
      }
    };
    validate();
  }, [token]);

  const handleUnsubscribe = async () => {
    if (!token) return;
    setStatus("loading");
    try {
      const { data, error } = await supabase.functions.invoke("handle-email-unsubscribe", {
        body: { token },
      });
      if (error) throw error;
      if (data?.success) {
        setStatus("success");
      } else if (data?.reason === "already_unsubscribed") {
        setStatus("already");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6 text-center space-y-4">
          {status === "loading" && (
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          )}

          {status === "valid" && (
            <>
              <h1 className="text-xl font-bold text-foreground">Отписка от рассылки</h1>
              <p className="text-muted-foreground">
                Вы уверены, что хотите отписаться от уведомлений Get4You?
              </p>
              <Button onClick={handleUnsubscribe} variant="destructive">
                Подтвердить отписку
              </Button>
            </>
          )}

          {status === "success" && (
            <>
              <CheckCircle className="h-12 w-12 text-primary mx-auto" />
              <h1 className="text-xl font-bold text-foreground">Вы отписаны</h1>
              <p className="text-muted-foreground">
                Вы больше не будете получать уведомления от Get4You.
              </p>
            </>
          )}

          {status === "already" && (
            <>
              <CheckCircle className="h-12 w-12 text-muted-foreground mx-auto" />
              <h1 className="text-xl font-bold text-foreground">Уже отписаны</h1>
              <p className="text-muted-foreground">
                Вы уже отписаны от уведомлений.
              </p>
            </>
          )}

          {(status === "invalid" || status === "error") && (
            <>
              <XCircle className="h-12 w-12 text-destructive mx-auto" />
              <h1 className="text-xl font-bold text-foreground">Ошибка</h1>
              <p className="text-muted-foreground">
                Ссылка для отписки недействительна или устарела.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Unsubscribe;
