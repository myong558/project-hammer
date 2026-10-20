/** 카카오톡 공유: 결과 이미지를 카카오 서버에 올리고, 이미지와 게임 링크 버튼이 함께 든 피드 메시지로 보낸다 */

const KAKAO_JS_KEY = '5f6ed1aa6b6791f50c36fd13861c5465';
const SDK_URL = 'https://t1.kakaocdn.net/kakao_js_sdk/2.8.0/kakao.min.js';
const SDK_INTEGRITY = 'sha384-Lvrr4dmJLLhBimcAC4GfpNV3oEGKgfd26Mp7KkvDz8PxGrhUhUT3zoax7EirW8fu';

interface KakaoLink {
  mobileWebUrl: string;
  webUrl: string;
}

interface KakaoSdk {
  init(key: string): void;
  isInitialized(): boolean;
  Share: {
    uploadImage(opts: { file: File[] }): Promise<{ infos: { original: { url: string; width: number; height: number } } }>;
    sendDefault(template: {
      objectType: 'feed';
      content: {
        title: string;
        description: string;
        imageUrl: string;
        imageWidth?: number;
        imageHeight?: number;
        link: KakaoLink;
      };
      buttons: { title: string; link: KakaoLink }[];
    }): void;
  };
}

declare global {
  interface Window {
    Kakao?: KakaoSdk;
  }
}

let sdk: Promise<KakaoSdk | null> | null = null;

/** SDK는 결과 화면에서 처음 쓸 때 한 번만 불러온다. 오프라인 등으로 못 불러오면 null */
export function loadKakao(): Promise<KakaoSdk | null> {
  sdk ??= new Promise((resolve) => {
    const ready = () => {
      const k = window.Kakao;
      if (!k) return resolve(null);
      if (!k.isInitialized()) k.init(KAKAO_JS_KEY);
      resolve(k);
    };
    if (window.Kakao) return ready();
    const s = document.createElement('script');
    s.src = SDK_URL;
    s.integrity = SDK_INTEGRITY;
    s.crossOrigin = 'anonymous';
    s.onload = ready;
    s.onerror = () => {
      sdk = null; // 다음에 다시 시도한다
      s.remove();
      resolve(null);
    };
    document.head.append(s);
  });
  return sdk;
}

export interface KakaoShare {
  title: string;
  description: string;
  buttonTitle: string;
  url: string;
}

/** 같은 결과 이미지는 한 번만 올리고, 다시 보낼 때는 올려 둔 주소를 쓴다 */
const uploaded = new WeakMap<Blob, Promise<{ url: string; width: number; height: number }>>();

export async function shareToKakao(image: Blob, msg: KakaoShare): Promise<boolean> {
  const kakao = await loadKakao();
  if (!kakao) return false;
  let upload = uploaded.get(image);
  if (!upload) {
    upload = kakao.Share.uploadImage({
      file: [new File([image], 'project-hammer-result.png', { type: 'image/png' })],
    }).then((r) => r.infos.original);
    uploaded.set(image, upload);
    upload.catch(() => uploaded.delete(image));
  }
  const img = await upload;
  const link = { mobileWebUrl: msg.url, webUrl: msg.url };
  kakao.Share.sendDefault({
    objectType: 'feed',
    content: {
      title: msg.title,
      description: msg.description,
      imageUrl: img.url,
      imageWidth: img.width,
      imageHeight: img.height,
      link,
    },
    buttons: [{ title: msg.buttonTitle, link }],
  });
  return true;
}
