import React, { useEffect, useMemo, useState } from 'react';
import { Language, ShopConfig } from '../types';
import { uploadImage } from '../services/storage';
import { migrateLegacyShopData } from '../services/migration';

interface ShopSettingsProps {
  shopId: string;
  shopConfig: ShopConfig | null;
  lang: Language;
  mode?: 'setup' | 'edit';
  onSave: (config: ShopConfig) => Promise<void>;
  adminUid?: string | null;
}

const THEMES = [
  { id: 'classic', label: 'Classic Gold' },
  { id: 'noir', label: 'Noir Luxe' },
  { id: 'heritage', label: 'Heritage Club' }
];

export const ShopSettings: React.FC<ShopSettingsProps> = ({
  shopId,
  shopConfig,
  lang,
  mode = 'edit',
  onSave,
  adminUid
}) => {
  const [name, setName] = useState('');
  const [tagline, setTagline] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [heroDesktopUrl, setHeroDesktopUrl] = useState('');
  const [heroMobileUrl, setHeroMobileUrl] = useState('');

  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  const [monFri, setMonFri] = useState('10:00 - 20:00');
  const [sat, setSat] = useState('10:00 - 18:00');
  const [sun, setSun] = useState('Closed');

  const [themeId, setThemeId] = useState('classic');
  const [voiceAgentName, setVoiceAgentName] = useState('Assistant');

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationNote, setMigrationNote] = useState('');

  const domain = useMemo(() => {
    if (typeof window === 'undefined') return 'local';
    return window.location.hostname;
  }, []);

  useEffect(() => {
    if (!shopConfig) return;
    setName(shopConfig.branding?.name || '');
    setTagline(shopConfig.branding?.tagline || '');
    setLogoUrl(shopConfig.branding?.logoUrl || '');
    setHeroDesktopUrl(shopConfig.hero?.desktopUrl || '');
    setHeroMobileUrl(shopConfig.hero?.mobileUrl || '');
    setAddress(shopConfig.contact?.address || '');
    setPhone(shopConfig.contact?.phone || '');
    setEmail(shopConfig.contact?.email || '');
    setMonFri(shopConfig.hours?.monFri || '');
    setSat(shopConfig.hours?.sat || '');
    setSun(shopConfig.hours?.sun || '');
    setThemeId(shopConfig.themeId || 'classic');
    setVoiceAgentName(shopConfig.voiceAgentName || 'Assistant');
  }, [shopConfig]);

  const handleImageUpload = async (file: File, path: string, setUrl: (url: string) => void) => {
    const url = await uploadImage(file, path);
    setUrl(url);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMigrationNote('');
    setIsSaving(true);
    try {
      if (!name) {
        setError(lang === 'bg' ? 'Името на салона е задължително.' : 'Shop name is required.');
        setIsSaving(false);
        return;
      }

      const now = Date.now();
      const existingAdmins = shopConfig?.adminUids || [];
      const mergedAdmins = adminUid ? Array.from(new Set([...existingAdmins, adminUid])) : existingAdmins;
      const domains = shopConfig?.domains?.length ? shopConfig.domains : [domain];
      const mergedDomains = domains.includes(domain) ? domains : [...domains, domain];
      const brandingTagline = tagline.trim();
      const brandingLogo = logoUrl || null;
      const heroDesktop = heroDesktopUrl || null;
      const heroMobile = heroMobileUrl || null;
      const baseConfig: ShopConfig = {
        id: shopId,
        domains: mergedDomains,
        adminUids: mergedAdmins,
        plan: shopConfig?.plan || 'basic',
        branding: {
          name: name.trim(),
          tagline: brandingTagline ? brandingTagline : null,
          logoUrl: brandingLogo
        },
        hero: {
          desktopUrl: heroDesktop,
          mobileUrl: heroMobile
        },
        contact: {
          address: address.trim(),
          phone: phone.trim(),
          email: email.trim()
        },
        hours: {
          monFri: monFri.trim(),
          sat: sat.trim(),
          sun: sun.trim()
        },
        themeId,
        voiceAgentName: voiceAgentName.trim() || 'Assistant',
        features: shopConfig?.features || { voiceEnabled: false, chatEnabled: false, aiToolsEnabled: false },
        onboarded: true,
        createdAt: shopConfig?.createdAt || now,
        updatedAt: now
      };

      await onSave(baseConfig);
    } catch (err) {
      console.error(err);
      setError(lang === 'bg' ? 'Неуспешно запазване.' : 'Failed to save.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8 text-center">
        <h2 className="text-3xl font-display text-gold-400">
          {mode === 'setup' ? (lang === 'bg' ? 'Първоначална настройка' : 'Initial Setup') : (lang === 'bg' ? 'Настройки на сайта' : 'Website Settings')}
        </h2>
        <p className="text-gray-500 text-sm mt-2">
          {mode === 'setup'
            ? (lang === 'bg' ? 'Попълнете информацията за салона и инсталирайте темата.' : 'Fill in your shop details and install a theme.')
            : (lang === 'bg' ? 'Обновете брандинга и функциите на сайта.' : 'Update branding and platform features.')}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        <div className="bg-dark-800 p-6 rounded-xl border border-gray-800">
          <h3 className="text-lg font-display text-white mb-4">{lang === 'bg' ? 'Брандинг' : 'Branding'}</h3>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs uppercase tracking-wider text-gray-400 mb-2">
                {lang === 'bg' ? 'Име на салона' : 'Shop name'}
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-dark-900 border border-gray-700 rounded p-3 text-white"
                placeholder={lang === 'bg' ? 'Име на бранд' : 'Brand name'}
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-gray-400 mb-2">
                {lang === 'bg' ? 'Слоган (по избор)' : 'Tagline (optional)'}
              </label>
              <input
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                className="w-full bg-dark-900 border border-gray-700 rounded p-3 text-white"
                placeholder={lang === 'bg' ? 'Кратко описание' : 'Short description'}
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs uppercase tracking-wider text-gray-400 mb-2">
                {lang === 'bg' ? 'Лого' : 'Logo'}
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="file"
                  accept="image/*"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    await handleImageUpload(file, `shops/${shopId}/branding/logo-${Date.now()}-${file.name}`, setLogoUrl);
                  }}
                  className="text-sm text-gray-400"
                />
                {logoUrl && <img src={logoUrl} alt="Logo" className="h-10 w-auto" />}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-dark-800 p-6 rounded-xl border border-gray-800">
          <h3 className="text-lg font-display text-white mb-4">{lang === 'bg' ? 'Hero изображения' : 'Hero Images'}</h3>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs uppercase tracking-wider text-gray-400 mb-2">
                {lang === 'bg' ? 'Десктоп изображение' : 'Desktop image'}
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  await handleImageUpload(file, `shops/${shopId}/branding/hero-desktop-${Date.now()}-${file.name}`, setHeroDesktopUrl);
                }}
                className="text-sm text-gray-400"
              />
              {heroDesktopUrl && <img src={heroDesktopUrl} alt="Hero Desktop" className="mt-3 rounded-lg border border-gray-700" />}
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-gray-400 mb-2">
                {lang === 'bg' ? 'Мобилно изображение' : 'Mobile image'}
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  await handleImageUpload(file, `shops/${shopId}/branding/hero-mobile-${Date.now()}-${file.name}`, setHeroMobileUrl);
                }}
                className="text-sm text-gray-400"
              />
              {heroMobileUrl && <img src={heroMobileUrl} alt="Hero Mobile" className="mt-3 rounded-lg border border-gray-700" />}
            </div>
          </div>
        </div>

        <div className="bg-dark-800 p-6 rounded-xl border border-gray-800">
          <h3 className="text-lg font-display text-white mb-4">{lang === 'bg' ? 'Контакти и работно време' : 'Contact & Hours'}</h3>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs uppercase tracking-wider text-gray-400 mb-2">{lang === 'bg' ? 'Адрес' : 'Address'}</label>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full bg-dark-900 border border-gray-700 rounded p-3 text-white"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-gray-400 mb-2">{lang === 'bg' ? 'Телефон' : 'Phone'}</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full bg-dark-900 border border-gray-700 rounded p-3 text-white"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-gray-400 mb-2">{lang === 'bg' ? 'Имейл' : 'Email'}</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-dark-900 border border-gray-700 rounded p-3 text-white"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-gray-400 mb-2">{lang === 'bg' ? 'Пон - Пет' : 'Mon - Fri'}</label>
              <input
                value={monFri}
                onChange={(e) => setMonFri(e.target.value)}
                className="w-full bg-dark-900 border border-gray-700 rounded p-3 text-white"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-gray-400 mb-2">{lang === 'bg' ? 'Събота' : 'Saturday'}</label>
              <input
                value={sat}
                onChange={(e) => setSat(e.target.value)}
                className="w-full bg-dark-900 border border-gray-700 rounded p-3 text-white"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-gray-400 mb-2">{lang === 'bg' ? 'Неделя' : 'Sunday'}</label>
              <input
                value={sun}
                onChange={(e) => setSun(e.target.value)}
                className="w-full bg-dark-900 border border-gray-700 rounded p-3 text-white"
              />
            </div>
          </div>
        </div>

        <div className="bg-dark-800 p-6 rounded-xl border border-gray-800">
          <h3 className="text-lg font-display text-white mb-4">{lang === 'bg' ? 'Тема и асистент' : 'Theme & Assistant'}</h3>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs uppercase tracking-wider text-gray-400 mb-2">{lang === 'bg' ? 'Тема' : 'Theme'}</label>
              <select
                value={themeId}
                onChange={(e) => setThemeId(e.target.value)}
                className="w-full bg-dark-900 border border-gray-700 rounded p-3 text-white"
              >
                {THEMES.map(theme => (
                  <option key={theme.id} value={theme.id}>{theme.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-gray-400 mb-2">{lang === 'bg' ? 'Име на voice асистента' : 'Voice assistant name'}</label>
              <input
                value={voiceAgentName}
                onChange={(e) => setVoiceAgentName(e.target.value)}
                className="w-full bg-dark-900 border border-gray-700 rounded p-3 text-white"
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500 text-red-400 p-3 rounded">
            {error}
          </div>
        )}

        {migrationNote && (
          <div className="bg-green-500/10 border border-green-500 text-green-400 p-3 rounded">
            {migrationNote}
          </div>
        )}

        <button
          type="submit"
          disabled={isSaving}
          className="w-full bg-gold-500 text-black font-bold py-4 rounded-xl hover:bg-gold-400 transition disabled:opacity-60"
        >
          {isSaving
            ? (lang === 'bg' ? 'Запазване...' : 'Saving...')
            : (mode === 'setup' ? (lang === 'bg' ? 'Завърши настройката' : 'Complete setup') : (lang === 'bg' ? 'Запази промените' : 'Save changes'))}
        </button>
      </form>

      <div className="mt-10 bg-dark-800 p-6 rounded-xl border border-gray-800">
        <h3 className="text-lg font-display text-white mb-3">
          {lang === 'bg' ? 'Импорт на стари данни' : 'Import legacy data'}
        </h3>
        <p className="text-sm text-gray-400 mb-4">
          {lang === 'bg'
            ? 'Ако имате съществуващи данни в стария формат, можете да ги прехвърлите към този магазин.'
            : 'If you have existing data in the legacy format, you can migrate it into this shop.'}
        </p>
        <button
          type="button"
          disabled={isMigrating}
          onClick={async () => {
            setIsMigrating(true);
            setMigrationNote('');
            setError('');
            try {
              const result = await migrateLegacyShopData(shopId);
              const msg = lang === 'bg'
                ? `Импортирани: услуги ${result.services}, бръснари ${result.barbers}, резервации ${result.appointments}.`
                : `Imported: services ${result.services}, barbers ${result.barbers}, appointments ${result.appointments}.`;
              setMigrationNote(msg);
            } catch (err) {
              console.error(err);
              setError(lang === 'bg' ? 'Импортът не беше успешен.' : 'Migration failed.');
            } finally {
              setIsMigrating(false);
            }
          }}
          className="w-full bg-dark-900 border border-gold-500/40 text-gold-400 font-bold py-3 rounded-lg hover:bg-gold-500 hover:text-black transition disabled:opacity-60"
        >
          {isMigrating ? (lang === 'bg' ? 'Импортиране...' : 'Migrating...') : (lang === 'bg' ? 'Импортирай данните' : 'Run migration')}
        </button>
      </div>
    </div>
  );
};
