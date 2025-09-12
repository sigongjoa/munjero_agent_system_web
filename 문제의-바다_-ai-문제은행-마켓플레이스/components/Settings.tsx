import React, { useState, useEffect } from 'react';
import type { AppSettings } from '../types';
import { SaveIcon, EyeIcon, EyeOffIcon, KeyIcon, Loader2Icon, CheckCircleIcon, XCircleIcon } from './icons';

interface SettingsProps {
    initialSettings: AppSettings;
    onSave: (settings: AppSettings) => void;
    accessToken: string | null;
    isLoggedIn: boolean;
}

type ValidationStatus = 'idle' | 'testing' | 'success' | 'error';
type SettingsKey = keyof AppSettings;

const Settings: React.FC<SettingsProps> = ({ initialSettings, onSave, accessToken, isLoggedIn }) => {
    const [settings, setSettings] = useState<AppSettings>(initialSettings);
    const [isApiKeyVisible, setIsApiKeyVisible] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);

    const [validationStatus, setValidationStatus] = useState<Record<string, ValidationStatus>>(
        Object.keys(initialSettings).reduce<Record<string, ValidationStatus>>((acc, key) => {
            acc[key] = 'idle';
            return acc;
        }, {})
    );
    const [errorMessages, setErrorMessages] = useState<Record<string, string | null>>(
         Object.keys(initialSettings).reduce<Record<string, string | null>>((acc, key) => {
            acc[key] = null;
            return acc;
         }, {})
    );


    useEffect(() => {
        setSettings(initialSettings);
    }, [initialSettings]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setSettings(prev => ({ ...prev, [name]: value }));
        setValidationStatus(prev => ({ ...prev, [name]: 'idle' }));
        setErrorMessages(prev => ({ ...prev, [name]: null }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(settings);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
    };

    const handleTestConnection = async (name: SettingsKey) => {
        setValidationStatus(prev => ({ ...prev, [name]: 'testing' }));
        setErrorMessages(prev => ({ ...prev, [name]: null }));

        const apiKey = settings.youtubeApiKey;
        const value = settings[name];

        const setError = (msg: string) => {
            setValidationStatus(prev => ({ ...prev, [name]: 'error' }));
            setErrorMessages(prev => ({ ...prev, [name]: msg }));
        };
        
        if (!isLoggedIn || !accessToken) {
            return setError('Google 계정으로 먼저 로그인해주세요.');
        }

        if (name !== 'youtubeApiKey' && !apiKey) {
            return setError('YouTube API Key를 먼저 입력하고 테스트해주세요.');
        }
        if (!value) {
            return setError('값을 입력해주세요.');
        }

        let testUrl: string | null = null;
        let useOAuth = true;

        switch(name) {
            case 'youtubeApiKey':
                useOAuth = false; // YouTube API Key validation uses the key directly.
                const channelId = settings.youtubeChannelId;
                if (!channelId) { return setError('테스트를 위해 YouTube 채널 ID가 필요합니다.'); }
                testUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${channelId}&key=${value}`;
                break;
            case 'youtubeChannelId':
                useOAuth = false;
                testUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${value}&key=${apiKey}`;
                break;
            case 'googleSheetId':
            case 'scheduledSheetId':
            case 'thumbnailSheetId':
                testUrl = `https://sheets.googleapis.com/v4/spreadsheets/${value}`;
                break;
            case 'googleDocsTemplateId':
                testUrl = `https://docs.googleapis.com/v1/documents/${value}`;
                break;
            case 'googleDriveFolderId':
                testUrl = `https://www.googleapis.com/drive/v3/files/${value}?fields=id,name`;
                break;
            default:
                setValidationStatus(prev => ({...prev, [name]: 'success'}));
                return;
        }

        try {
            const headers: HeadersInit = useOAuth ? { 'Authorization': `Bearer ${accessToken}` } : {};
            const response = await fetch(testUrl, { headers });
            
            if (response.status === 404) throw new Error('리소스를 찾을 수 없습니다. ID를 확인하세요.');
            if (response.status === 403) throw new Error('접근 권한이 없습니다. 리소스 공유 설정을 확인하세요.');
            if (response.status === 401) throw new Error('인증에 실패했습니다. 다시 로그인해주세요.');
            
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error?.message || `HTTP 에러! 상태: ${response.status}`);
            }

            if ((name === 'youtubeApiKey' || name === 'youtubeChannelId') && (!data.items || data.items.length === 0)) {
                 throw new Error('유효한 채널 ID를 찾을 수 없습니다.');
            }
            
            setValidationStatus(prev => ({ ...prev, [name]: 'success' }));
        } catch (err) {
            setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
        }
    };

    const inputFields: { name: SettingsKey; label: string; type: string; icon?: React.FC<{className?: string}>; isTestable: boolean }[] = [
        { name: 'googleClientId', label: 'GOOGLE_CLIENT_ID', type: 'text', isTestable: false },
        { name: 'youtubeApiKey', label: 'YOUTUBE_API_KEY', type: 'password', icon: KeyIcon, isTestable: true },
        { name: 'youtubeChannelId', label: 'YOUTUBE_CHANNEL_ID', type: 'text', isTestable: true },
        { name: 'googleSheetId', label: 'GOOGLE_SHEET_ID', type: 'text', isTestable: true },
        { name: 'googleWorksheetName', label: 'GOOGLE_WORKSHEET_NAME', type: 'text', isTestable: false },
        { name: 'scheduledSheetId', label: 'SCHEDULED_SHEET_ID', type: 'text', isTestable: true },
        { name: 'scheduledWorksheetName', label: 'SCHEDULED_WORKSHEET_NAME', type: 'text', isTestable: false },
        { name: 'thumbnailSheetId', label: 'THUMBNAIL_SHEET_ID', type: 'text', isTestable: true },
        { name: 'thumbnailWorksheetName', label: 'THUMBNAIL_WORKSHEET_NAME', type: 'text', isTestable: false },
        { name: 'googleDocsTemplateId', label: 'GOOGLE_DOCS_TEMPLATE_ID', type: 'text', isTestable: true },
        { name: 'googleDriveFolderId', label: 'GOOGLE_DRIVE_FOLDER_ID', type: 'text', isTestable: true },
    ];

    const renderValidationStatus = (name: SettingsKey) => {
        const status = validationStatus[name];
        const message = errorMessages[name];
        
        switch (status) {
            case 'testing':
                return <Loader2Icon className="w-5 h-5 text-slate-500 animate-spin" />;
            case 'success':
                return <CheckCircleIcon className="w-6 h-6 text-green-500" />;
            case 'error':
                return (
                    <div className="relative group">
                        <XCircleIcon className="w-6 h-6 text-red-500" />
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-xs p-2 text-xs text-white bg-slate-700 rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                            {message}
                        </div>
                    </div>
                );
            default:
                return <div className="w-6 h-6" />; // Placeholder for alignment
        }
    }

    return (
        <div className="bg-white p-8 rounded-2xl shadow-lg border border-slate-200 animate-fade-in max-w-4xl mx-auto">
            <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-slate-800">GCP & YouTube 설정</h2>
                <p className="text-slate-500 mt-1">애플리케이션에서 사용할 API 키 및 ID를 관리하고 연결을 테스트하세요.</p>
            </div>
            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-8">
                    {inputFields.map(field => (
                        <div key={field.name}>
                            <label htmlFor={field.name} className="block text-sm font-medium text-slate-700 mb-2">
                                {field.label}
                            </label>
                            <div className="flex items-center gap-2">
                                <div className="relative flex-grow">
                                    {field.icon && <field.icon className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />}
                                    <input
                                        type={field.type === 'password' ? (isApiKeyVisible ? 'text' : 'password') : 'text'}
                                        id={field.name}
                                        name={field.name}
                                        value={settings[field.name as keyof AppSettings]}
                                        onChange={handleChange}
                                        className={`w-full border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition ${field.icon ? 'pl-10' : 'pl-4'} pr-4 py-2.5`}
                                        placeholder={`${field.label} 입력`}
                                    />
                                    {field.name === 'youtubeApiKey' && (
                                        <button
                                            type="button"
                                            onClick={() => setIsApiKeyVisible(!isApiKeyVisible)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700"
                                            aria-label={isApiKeyVisible ? "API 키 숨기기" : "API 키 보기"}
                                        >
                                            {isApiKeyVisible ? <EyeOffIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                                        </button>
                                    )}
                                </div>
                                {field.isTestable ? (
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => handleTestConnection(field.name)}
                                            disabled={validationStatus[field.name] === 'testing' || !isLoggedIn}
                                            className="px-4 py-2.5 text-sm font-semibold bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                                            title={!isLoggedIn ? 'Google 계정으로 로그인 후 테스트 가능합니다.' : ''}
                                        >
                                            테스트
                                        </button>
                                        <div className="w-6 h-6 flex items-center justify-center">
                                          {renderValidationStatus(field.name)}
                                        </div>
                                    </>
                                ) : <div className="w-[124px]" /> /* Placeholder for alignment */}
                            </div>
                        </div>
                    ))}
                </div>
                <div className="flex items-center justify-end pt-4">
                    {saveSuccess && (
                        <p className="text-green-600 font-semibold mr-4 animate-fade-in">
                            설정이 저장되었습니다!
                        </p>
                    )}
                    <button
                        type="submit"
                        className="flex items-center justify-center gap-2 bg-primary-600 text-white font-bold py-2.5 px-6 rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-all duration-200"
                    >
                        <SaveIcon className="w-5 h-5" />
                        저장
                    </button>
                </div>
            </form>
        </div>
    );
};

export default Settings;
