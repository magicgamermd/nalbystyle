import React, { useEffect, useState } from 'react';
import { Language, ShopConfig } from '../types';

interface PlanSettingsProps {
  shopId: string;
  shopConfig: ShopConfig | null;
  lang: Language;
  onSave: (config: ShopConfig) => Promise<void>;
}

const PLAN_PRESETS = {
  basic: { voiceEnabled: false, chatEnabled: false, aiToolsEnabled: false },
  pro: { voiceEnabled: false, chatEnabled: true, aiToolsEnabled: true },
  premium: { voiceEnabled: true, chatEnabled: true, aiToolsEnabled: true }
} as const;

export const PlanSettings: React.FC<PlanSettingsProps> = ({ shopId, shopConfig, lang, onSave }) => {
  const [plan, setPlan] = useState<'basic' | 'pro' | 'premium'>('basic');
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [chatEnabled, setChatEnabled] = useState(false);
  const [aiToolsEnabled, setAiToolsEnabled] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!shopConfig) return;
    setPlan(shopConfig.plan || 'basic');
    setVoiceEnabled(shopConfig.features?.voiceEnabled ?? false);
    setChatEnabled(shopConfig.features?.chatEnabled ?? false);
    setAiToolsEnabled(shopConfig.features?.aiToolsEnabled ?? false);
  }, [shopConfig]);

  const handleSave = async () => {
    if (!shopConfig) return;
    setIsSaving(true);
    setError('');
    try {
      const updated: ShopConfig = {
        ...shopConfig,
        id: shopId,
        plan,
        features: {
          voiceEnabled,
          chatEnabled,
          aiToolsEnabled
        },
        updatedAt: Date.now()
      };
      await onSave(updated);
    } catch (err) {
      console.error(err);
      setError(lang === 'bg' ? 'Неуспешно запазване.' : 'Failed to save.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-dark-800 p-6 rounded-xl border border-gray-800 space-y-6">
        <div>
          <h3 className="text-lg font-display text-white mb-2">{lang === 'bg' ? 'План' : 'Plan'}</h3>
          <select
            value={plan}
            onChange={(e) => {
              const value = e.target.value as 'basic' | 'pro' | 'premium';
              setPlan(value);
              const preset = PLAN_PRESETS[value];
              setVoiceEnabled(preset.voiceEnabled);
              setChatEnabled(preset.chatEnabled);
              setAiToolsEnabled(preset.aiToolsEnabled);
            }}
            className="w-full bg-dark-900 border border-gray-700 rounded p-3 text-white"
          >
            <option value="basic">Basic</option>
            <option value="pro">Pro</option>
            <option value="premium">Premium</option>
          </select>
          <p className="text-xs text-gray-500 mt-2">
            {lang === 'bg'
              ? 'Планът задава началните функции. Можете ръчно да променяте опциите.'
              : 'Plan sets default features. You can manually override them.'}
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <label className="flex items-center gap-3 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={voiceEnabled}
              onChange={(e) => setVoiceEnabled(e.target.checked)}
              className="h-4 w-4"
            />
            {lang === 'bg' ? 'Voice асистент' : 'Voice assistant'}
          </label>
          <label className="flex items-center gap-3 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={chatEnabled}
              onChange={(e) => setChatEnabled(e.target.checked)}
              className="h-4 w-4"
            />
            {lang === 'bg' ? 'Чат асистент' : 'Chat assistant'}
          </label>
          <label className="flex items-center gap-3 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={aiToolsEnabled}
              onChange={(e) => setAiToolsEnabled(e.target.checked)}
              className="h-4 w-4"
            />
            {lang === 'bg' ? 'AI инструменти' : 'AI tools'}
          </label>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500 text-red-400 p-3 rounded">
            {error}
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full bg-gold-500 text-black font-bold py-3 rounded-lg hover:bg-gold-400 transition disabled:opacity-60"
        >
          {isSaving ? (lang === 'bg' ? 'Запазване...' : 'Saving...') : (lang === 'bg' ? 'Запази план' : 'Save plan')}
        </button>
      </div>
    </div>
  );
};
