import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Logo de Rocha e Campos Advogados (monograma dourado + ilustração mãe/bebê
 * rosé + wordmark "Previdenciário / Salário Maternidade"), PNG com fundo
 * transparente. Diferente da marca anterior (ADVFlow PRO, só existia em
 * versão branca pra fundo escuro), esta usa tons escuros (dourado/marrom)
 * que têm contraste em ambos os temas — por isso sem chip de fundo fixo
 * aqui (decisão do usuário, confirmada ao trocar a marca).
 *
 * É um lockup vertical (ícone empilhado sobre o texto, ~335x386), não um
 * banner horizontal — por isso o tamanho default é por altura só o
 * suficiente pra caber na barra lateral (h-16 do container em Sidebar/
 * MobileNav); em telas com mais espaço vertical (login), passe um
 * `imageClassName` maior pra ler o texto com folga.
 */
export function Logo({
  className,
  imageClassName,
}: {
  className?: string;
  imageClassName?: string;
}) {
  return (
    <div className={cn("inline-flex items-center", className)}>
      <Image
        src="/brand/logo.png"
        alt="Rocha e Campos Advogados — Previdenciário Salário Maternidade"
        width={335}
        height={386}
        priority
        className={cn("h-12 w-auto", imageClassName)}
      />
    </div>
  );
}
