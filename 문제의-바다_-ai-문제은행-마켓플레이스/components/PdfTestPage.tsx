


import React, { useState, useRef } from 'react';
import { generateSuneungStylePdf } from '../services/pdfGenerator';
import { parseExamPaperContent } from '../services/geminiService';
import { FileDownIcon, UploadIcon, XCircleIcon, PlusSquareIcon } from './icons';

const PdfTestPage: React.FC = () => {
    const defaultText = `지문
인터넷 밈 ‘도황’은 만화 『원피스』의 등장인물 돈키호테 도플라밍고를 과장되게 찬양하면서 동시에 조롱하는 현상을 일컫는다.‘도플라밍고 + 황제’의 합성어인 이 밈은, 겉보기에는 위엄과 간지를 뽐내지만 실제 이야기 속에서는 추락과 굴욕을 겪는 캐릭터의 모순적 행보에서 유래했다.이는 단순한 유머를 넘어 ‘허세와 허상 권력의 붕괴’를 유희적으로 소비하는 현대 밈의 대표적 사례로 평가받는다.

도황 밈은 2019년 디시인사이드의 '원피스 버닝블러드 갤러리'에서 시작되어, 이후 에펨코리아, 유튜브 등 국내 주요 커뮤니티 전반으로 폭발적으로 확산되었다.도플라밍고는 작중 초반부 ‘칠무해 중 최강자’급의 위압적인 포스를 자랑하며 강자들 앞에서도 당당한 태도를 보였다.그러나 드레스로자 편에서 주인공 루피에게 패배하고 임펠다운에 수감되는 등 굴욕적인 결말을 맞이하며, 그의 과거 허세는 조롱의 대상이 되었다.그의 “허세 가득한 말과 행동”과 이후의 비참한 패배, 자기합리화적 언동 등이 밈화의 주요 동력이 되었다.

[그림 1] 강자들 앞에서도 당당했던 돈키호테 도플라밍고의 초반 모습

‘도황 진짜 씹간지네’처럼 진지한 찬양인 척 조롱하는 문구나, 카이도와의 통화 중 당황한 장면에서 유래한 ‘야, 잠깐, 로!!!’, 임펠다운 수감 중에도 인터넷을 하는 듯한 ‘도황 와이파이’ 등 다양한 키워드가 그의 허세를 풍자한다.이외에도 ‘41세 금쪽이’, ‘츠군젠’ 등 캐릭터의 상황을 비극적이면서도 우스꽝스럽게 연출하는 응용 드립들이 폭넓게 사용된다.

도황 밈은 이름 끝에 ‘황’을 붙여 다른 캐릭터나 심지어 패션, 말투, 허세 이미지가 유사한 실존 인물에게까지 확장 적용된다.이러한 밈은 위계적 강자에 대한 허구성을 풍자하고, 원작이 설정한 ‘강자’ 서사를 커뮤니티의 해석으로 해체 및 재조립하는 특징을 보인다.이는 진지한 것을 진지하지 않게, 강함을 약함으로 되돌려 풍자하는 현대 대중문화의 유희적 소비 방식을 보여주는 중요한 사회문화적 함의를 지닌다.

Q1. 윗글의 ‘도황’ 밈에 대한 설명으로 적절하지 않은 것은?
① 『원피스』의 등장인물 돈키호테 도플라밍고를 대상으로 한다.
② 겉으로는 칭찬하는 듯하나 실제로는 조롱하는 이중적 성격을 지닌다.
③ 캐릭터의 허세와 실제 행보 간의 괴리에서 유머를 찾는다.
④ 주로 원피스 버닝블러드 갤러리 내에서만 사용되는 폐쇄적인 밈이다.
⑤ ‘도플라밍고 + 황제’의 합성어로, 캐릭터의 위상을 역설적으로 표현한다.

Q2. 윗글을 바탕으로 <보기>의 상황에 대해 추론한 내용으로 가장 적절한 것은?
<보기> 한 유명 정치인이 과거 자신의 화려했던 업적을 과장하여 자랑했으나, 최근 대중 앞에서 연이은 실책으로 신뢰를 잃고 대중의 조롱거리가 되었다.
① 정치인의 실책은 대중의 정치 참여를 저해할 것이다.
② 정치인에 대한 대중의 조롱은 밈으로 발전하기 어려울 것이다.
③ 정치인의 허세와 몰락은 ‘도황’ 밈과 유사한 방식으로 소비될 수 있다.
④ 대중은 정치인의 과거 업적을 재평가하여 긍정적으로 인식할 것이다.
⑤ 정치인의 몰락은 권위 있는 인물에 대한 무조건적인 숭배로 이어질 것이다.

Q3. 윗글에서 설명하는 ‘도황’ 밈의 사회문화적 함의로 적절하지 않은 것은?
① 권력을 가진 인물의 허구성을 풍자하는 경향을 보여준다.
② 원작의 서사를 커뮤니티의 시각으로 재해석하고 변형한다.
③ 진지한 대상을 가볍게 다루며 유희적으로 소비하는 문화를 반영한다.
④ 강함을 약함으로 되돌려 풍자하는 현대 대중문화의 코드를 담고 있다.
⑤ 특정 캐릭터에 대한 팬덤의 순수한 숭배와 찬양을 목적으로 한다`;
    const [text, setText] = useState<string>(defaultText);
    const [isLoading, setIsLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');

    // Image upload state and handlers
    const [imagePreviews, setImagePreviews] = useState<string[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    const handleFileSelect = (files: FileList | null) => {
        if (!files) return;
        const newFiles = Array.from(files);
        
        newFiles.forEach(file => {
            if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onloadend = () => {
                    setImagePreviews(prev => [...prev, reader.result as string]);
                };
                reader.readAsDataURL(file);
            }
        });
    };

    const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        handleFileSelect(event.target.files);
        if(fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const removeImage = (indexToRemove: number) => {
        setImagePreviews(prev => prev.filter((_, index) => index !== indexToRemove));
    }

    const handleDragEvents = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        handleDragEvents(e);
        if (!isDragging) setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
        handleDragEvents(e);
        setIsDragging(false);
    };
    
    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        handleDragEvents(e);
        setIsDragging(false);
        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            handleFileSelect(files);
        }
    };

    const handleDownload = async () => {
        if (!text.trim() && imagePreviews.length === 0) {
            alert('PDF로 만들 텍스트나 이미지를 입력해주세요.');
            return;
        }
        setIsLoading(true);
        try {
            // Step 1: Parse the content with AI
            setLoadingMessage('AI가 시험지 내용을 분석 중입니다...');
            const imagesDataUrls = imagePreviews.length > 0 ? imagePreviews : null;
            const parsedData = await parseExamPaperContent(text, imagesDataUrls);

            // Step 2: Generate the PDF with the parsed data
            setLoadingMessage('수능 시험지 양식으로 PDF를 생성 중입니다...');
            await generateSuneungStylePdf(parsedData, imagesDataUrls);

        } catch (e) {
            alert(`PDF 생성 중 오류가 발생했습니다: ${e instanceof Error ? e.message : 'Unknown error'}`);
            console.error(e);
        } finally {
            setIsLoading(false);
            setLoadingMessage('');
        }
    };

    return (
        <div 
            className="bg-white p-6 sm:p-8 rounded-2xl shadow-lg border border-slate-200 animate-fade-in"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            <div className="text-center mb-6">
                <h2 className="text-2xl sm:text-3xl font-bold text-slate-800 mb-1">수능 시험지 스타일 PDF 생성</h2>
                <p className="text-slate-500">지문과 문제를 입력하고 이미지를 업로드하면, AI가 자동으로 분석하여 수능 시험지 형식의 PDF를 생성합니다.</p>
            </div>

            <div className="space-y-6">
                 <div>
                    <label htmlFor="pdf-content" className="block text-sm font-medium text-slate-700 mb-2">
                        시험지 내용 입력
                    </label>
                    <textarea
                        id="pdf-content"
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        className="w-full h-96 p-4 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition"
                        placeholder="PDF로 변환할 지문, 문제, 이미지 참조([그림 1] 등)를 여기에 입력하세요..."
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">이미지 추가 (선택)</label>
                    <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleImageChange}
                        className="hidden"
                        ref={fileInputRef}
                    />
                    <div 
                        className={`w-full p-4 border-2 border-dashed rounded-lg transition-colors ${isDragging ? 'border-primary-500 bg-primary-50' : 'border-slate-300'}`}
                    >
                        {imagePreviews.length === 0 ? (
                            <div onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center justify-center h-32 cursor-pointer">
                                <UploadIcon className="w-10 h-10 text-slate-400 mb-2" />
                                <p className="font-semibold text-slate-700">이미지를 선택하거나 여기로 드래그하세요</p>
                                <p className="text-sm text-slate-500">여러 장의 사진을 한 번에 올릴 수 있습니다.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                {imagePreviews.map((preview, index) => (
                                    <div key={index} className="relative aspect-square group">
                                        <img src={preview} alt={`Uploaded preview ${index + 1}`} className="w-full h-full object-cover rounded-md border border-slate-200" />
                                        <button type="button" onClick={() => removeImage(index)} className="absolute -top-2 -right-2 bg-white rounded-full p-0.5 shadow-md hover:bg-red-100 transition opacity-0 group-hover:opacity-100">
                                            <XCircleIcon className="w-6 h-6 text-red-500"/>
                                        </button>
                                    </div>
                                ))}
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    className="flex flex-col items-center justify-center aspect-square border-2 border-dashed border-slate-300 rounded-md cursor-pointer hover:bg-slate-50 transition text-slate-500 hover:text-primary-600 hover:border-primary-400"
                                    aria-label="Add more images"
                                >
                                    <PlusSquareIcon className="w-8 h-8" />
                                    <span className="text-xs font-semibold mt-1">이미지 추가</span>
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="mt-8 flex justify-center">
                <button
                    onClick={handleDownload}
                    disabled={isLoading || (!text.trim() && imagePreviews.length === 0)}
                    className={`w-full max-w-xs bg-green-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-green-700 transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                    <FileDownIcon className="w-5 h-5" />
                    <span>{isLoading ? loadingMessage : '수능 시험지 스타일로 다운로드'}</span>
                </button>
            </div>
        </div>
    );
};

export default PdfTestPage;