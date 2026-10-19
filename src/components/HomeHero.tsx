import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { createTaskHref, type ServiceKey } from "@/lib/serviceRegistry";

interface HomeHeroProps {
  serviceLabel: string;
  services: { key: ServiceKey; label: string; icon: LucideIcon }[];
  title: ReactNode;
  description: string;
  image: string;
  children: ReactNode;
}

export function HomeHero({ serviceLabel, services, title, description, image, children }: HomeHeroProps) {
  return (
    <section className="bg-gradient-hero py-4 md:py-6" data-testid="home-banner" aria-labelledby="home-hero-title">
      <div className="container">
        <nav aria-labelledby="home-services-title">
          <p id="home-services-title" className="text-sm font-semibold text-foreground">{serviceLabel}</p>
          <div className="mt-2 grid grid-cols-2 gap-2 md:flex md:flex-wrap" data-testid="home-services">
            {services.map(({ key, label, icon: Icon }) => (
              <Button key={key} asChild variant="outline"
                className="h-auto min-h-12 min-w-0 justify-start gap-2 rounded-md border-border bg-card/80 px-3 py-2 text-start text-base font-semibold whitespace-normal shadow-none hover:bg-card">
                <Link to={createTaskHref(key)}>
                  <Icon className="!size-5 shrink-0 text-primary" />
                  <span className="min-w-0 leading-snug">{label}</span>
                </Link>
              </Button>
            ))}
          </div>
        </nav>
        <div className="mt-5 grid items-center gap-5 lg:mt-6 lg:grid-cols-2 lg:gap-10">
          <div className="min-w-0 max-w-2xl">
            <h1 id="home-hero-title" className="text-2xl font-extrabold text-foreground md:text-3xl">{title}</h1>
            <p className="mt-3 text-base leading-relaxed text-foreground">{description}</p>
            {children}
          </div>
          <img src={image} alt="" width={1366} height={768} className="block aspect-video w-full rounded-lg object-contain" />
        </div>
      </div>
    </section>
  );
}