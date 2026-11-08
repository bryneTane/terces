import manifest from '../../models/manifest.json';
import { Icon, type IconName } from '../components/Icon.tsx';
import { useI18n } from '../i18n.tsx';

export const SOURCE_URL = 'https://github.com/bryneTane/terces';

const MODEL_ROLE: Record<string, string> = {
  yunet: 'cat.face',
  'ppocr-det': 'cat.text',
  'yolox-nano': 'cat.person',
};
/** Role shown for a manifest model; every text reader (one per alphabet) is a text model. */
const roleOf = (name: string) => MODEL_ROLE[name] ?? (name.startsWith('ppocr-rec-') ? 'cat.text' : undefined);

function Section({ title, icon, children }: { title: string; icon: IconName; children: React.ReactNode }) {
  return (
    <section className="grid gap-3 border border-line bg-panel p-5 sm:p-7">
      <h2 className="m-0 flex items-center gap-3 font-display text-xl font-semibold">
        <span className="grid size-9 place-items-center border border-edge text-accent">
          <Icon name={icon} size={18} />
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export function About({ onBack }: { onBack: () => void }) {
  const { t } = useI18n();
  const models = manifest.models.filter((m) => roleOf(m.name));
  return (
    <article className="mx-auto grid w-full max-w-[860px] gap-5 px-4 pt-8 pb-20 text-[15px] leading-relaxed text-soft sm:px-8 sm:pt-12 [&_p]:m-0">
      <button type="button" onClick={onBack} className="btn-ghost justify-self-start">
        <Icon name="back" size={16} />
        {t('about.back')}
      </button>
      <h1
        tabIndex={-1}
        className="font-display mt-2 mb-2 text-[34px] leading-tight font-semibold tracking-[-0.025em] text-ink sm:text-[48px]"
      >
        {t('about.title')}
      </h1>
      <Section icon="noCloud" title={t('about.local.title')}>
        <p>{t('about.local.body')}</p>
      </Section>
      <Section icon="eye" title={t('about.check.title')}>
        <ul className="m-0 grid list-none gap-2.5 p-0">
          <li className="flex gap-3">
            <span className="mt-0.5 shrink-0 text-safe">
              <Icon name="check" size={16} strokeWidth={2.2} />
            </span>
            {t('about.check.offline')}
          </li>
          <li className="flex gap-3">
            <span className="mt-0.5 shrink-0 text-safe">
              <Icon name="check" size={16} strokeWidth={2.2} />
            </span>
            {t('about.check.csp')}
          </li>
          <li className="flex gap-3">
            <span className="mt-0.5 shrink-0 text-safe">
              <Icon name="check" size={16} strokeWidth={2.2} />
            </span>
            {t('about.check.source')}
          </li>
        </ul>
      </Section>
      <Section icon="chip" title={t('about.count.title')}>
        <p>{t('about.count.body')}</p>
        <pre
          className="m-0 overflow-x-auto border border-line bg-void p-4 font-mono text-[13px] text-accent"
          data-testid="count-request"
        >
          {'POST /api/hit\nContent-Type: text/plain\n\nscan   (or: cloak)'}
        </pre>
        <p>{t('about.count.stored')}</p>
        <p className="text-dim">{t('about.count.never')}</p>
      </Section>
      <Section icon="shield" title={t('about.limits.title')}>
        <p>{t('about.limits.body')}</p>
      </Section>
      <Section icon="code" title={t('about.models.title')}>
        <ul className="m-0 grid list-none gap-2 p-0 font-mono text-[13px]" data-testid="model-list">
          {models.map((m) => (
            <li key={m.name} className="border-b border-line pb-2 last:border-b-0">
              <span className="text-accent">{t(roleOf(m.name)!)}</span> · {m.source} · {m.license}
            </li>
          ))}
        </ul>
        <p className="text-[13px] text-dim">{t('about.models.map')}</p>
      </Section>
      <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer" className="btn-ghost justify-self-start">
        <Icon name="code" size={16} />
        {t('about.source')}
      </a>
    </article>
  );
}
