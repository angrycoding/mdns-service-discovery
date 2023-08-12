import RandExp from 'randexp';
import Peer from 'peerjs';


const SAVED_TOKEN_LS = 'saved_token';
const SAVED_PAGE_ID_LS = 'saved_exchange_page_id';
const IO_TIMEOUT_MS = 1000 * 5;

const SCAN_RESULTS_INITIAL_DELAY_MS = 3000;
const SCAN_RESULTS_CHECK_INTERVAL_MS = 2500;
const SCAN_RESULTS_TIMEOUT_MS = 1000 * 15;


class AccessToken {
	private access_token: string;
	constructor(access_token: string) {
		this.access_token = access_token;
	}
	toString = (): string => {
		return this.access_token;
	}
}

const fetchJSON = async(url: string): Promise<any> => {
	let result: any = undefined;
	const controller = new AbortController();
	const timeoutRef = setTimeout(() => controller.abort(), IO_TIMEOUT_MS);
	try {
		result = await fetch(url, { signal: controller.signal });
		result = await result?.json();
	} catch (e) {}
	clearTimeout(timeoutRef);
	return result;
}



const validateAccessToken = (accessToken: any): AccessToken | undefined => {
	if (typeof accessToken !== 'string') return;
	accessToken = accessToken.trim();
	if (!/^[0-9a-f]{30,}$/.test(accessToken)) {
		console.info('FAILED', accessToken)
		return;
	}
	return new AccessToken(accessToken);
}

const createAccount = async(): Promise<AccessToken | undefined> => {
	try {
		let response: any = undefined;
		response = await fetchJSON(`https://api.telegra.ph/createAccount?short_name=BLABLA`);
		return validateAccessToken(response?.result?.access_token);
	} catch (e) {}
}


const getAccessToken = async(): Promise<AccessToken | undefined> => {
	let accessToken = validateAccessToken(localStorage.getItem(SAVED_TOKEN_LS));
	if (!accessToken) {
		console.info('CREATING ACCOUNT...');
		accessToken = await createAccount();
		if (accessToken) {
			localStorage.setItem(SAVED_TOKEN_LS, accessToken.toString());
		} else {
			console.info('FAILED_TO_CREATE_ACCOUNT');
		}
	}
	return accessToken;
}





const getValidPageId = (pageId: any): string => {
	if (typeof pageId !== 'string') return '';
	if (!/^[0-9a-z]{36}[0-9a-z-]*$/.test(pageId)) return '';
	return pageId;
}



const createPage = async(accessToken: AccessToken, pathPrefix: string): Promise<string> => {

	try {

		const params = new URLSearchParams({
			access_token: accessToken.toString(),
			title: pathPrefix,
			content: JSON.stringify([' '])
		})
		
		let response: any = await fetchJSON(`https://api.telegra.ph/createPage?${params.toString()}`);
		if (response?.ok === true && typeof response?.result?.path === 'string' && response?.result?.path?.length) {
			return editPage(accessToken, response.result.path);
		}

	} catch (e) {}

	return ''
}


const editPage = async(accessToken: AccessToken, path: string): Promise<string> => {
	
	const accessTokenStr = accessToken.toString();

	try {

		let response: any = await fetchJSON(`https://api.telegra.ph/editPage/${path}?${new URLSearchParams({
			access_token: accessTokenStr,
			title: String(Date.now()),
			content: JSON.stringify([accessTokenStr])
		}).toString()}`);

		if (response?.ok === true && response?.result?.path === path) return path;

	} catch (e) {}
	
	return '';
}



const dnsQueryWebRtc = async(host: string, abortController: AbortController) => {
	

	try {

		const connection = new RTCPeerConnection({
			iceServers:[{
				urls: `stun:${host}`,
				credential: "a mulatto",
				username: "an albino"
			}],
		});
		
		abortController.signal.addEventListener('abort', () => connection.close(), { once: true });

		connection.createDataChannel('');
		const offer = await connection.createOffer();
		connection.setLocalDescription(offer);

	} catch (e) {}
}

const dnsQueryLink = (host: string, abortController: AbortController) => {
	const linkEl = document.createElement('link');
	abortController.signal.addEventListener('abort', () => linkEl.remove(), { once: true });
	linkEl.setAttribute('rel', 'dns-prefetch');
	linkEl.setAttribute('href', `//${host}`);
	document.head.appendChild(linkEl);
}

const dnsQueryIframe = (host: string, abortController: AbortController) => {
	const iframeEl = document.createElement('iframe');
	abortController.signal.addEventListener('abort', () => iframeEl.remove(), { once: true });
	iframeEl.style.transform = 'translate(-10000px, -10000px)';
	iframeEl.style.position = 'fixed';
	iframeEl.setAttribute('src', `//${host}`);
	document.documentElement.appendChild(iframeEl);
}

const dnsQueryImage = (host: string, abortController: AbortController) => {
	const imageEl = document.createElement('img');
	abortController.signal.addEventListener('abort', () => imageEl.remove(), { once: true });
	imageEl.style.transform = 'translate(-10000px, -10000px)';
	imageEl.style.position = 'fixed';
	imageEl.setAttribute('src', `//${host}`);
	document.documentElement.appendChild(imageEl);
}

const dnsQueryFetch = (host: string, abortController: AbortController) => {
	try {
		fetch(`//${host}`, { signal: abortController.signal, cache: 'reload' })
		.then(() => void(0))
		.catch(() => void(0))
	} catch (e) {}
}

const writeAccessTokenToExchangePage = async(): Promise<string> => {

	const accessToken = await getAccessToken();
	if (!accessToken) return '';

	let pagePath = getValidPageId(localStorage.getItem(SAVED_PAGE_ID_LS));
	
	if (pagePath) {
		pagePath = await editPage(accessToken, pagePath);
		if (pagePath) return pagePath;
	}

	// generate mdns safe title
	const pathPrefix = new RandExp(/^[0-9a-z]{36}$/).gen();

	const pageId = getValidPageId(await createPage(accessToken, pathPrefix));
	if (!pageId) return '';
	
	localStorage.setItem(SAVED_PAGE_ID_LS, pageId);

	return pageId;
}


const waitAnswerFromWebRTC = (path: string, abortController: AbortController) => new Promise<any>(resolve => {

	const peer = new Peer(path);

	const closeConnectionAndReturnResult = (result?: any) => {
		peer.removeAllListeners();
		peer.destroy();
		if (result instanceof Array) {
			console.info('got answer from webrtc')
			return resolve(result);
		}
	}

	abortController.signal.addEventListener('abort', () => closeConnectionAndReturnResult(), { once: true });
	peer.once('connection', (connection) => connection.once('data', closeConnectionAndReturnResult));

});

const waitAnswerFromTelegraph = async(path: string, abortController: AbortController) => new Promise<any>(resolve => {

	const start = Date.now();

	// if (abortController.signal.aborted) return;

	const doCheck = async() => {

		let response = await fetchJSON(`https://api.telegra.ph/getPage/${path}?return_content=true`);
		
		try {
			response = JSON.parse(response?.result?.content?.[0]);
			if (response instanceof Array) {
				console.info('got answer from telegraph')
				return resolve(response);
			}
		} catch (e) {}

		if (Date.now() - start >= SCAN_RESULTS_TIMEOUT_MS) {
			resolve(undefined);
		} else {
			setTimeout(doCheck, SCAN_RESULTS_CHECK_INTERVAL_MS);
		}

	};

	setTimeout(doCheck, SCAN_RESULTS_INITIAL_DELAY_MS);

});


const scanInternal = async() => {
	const path = await writeAccessTokenToExchangePage();
	if (!path) return;

	const host = `${path}.local`;


	const hosts = new Array(5).fill(0).map(() => {
		const noiseLength = Math.max(0, (63 - host.length) - 1);
		return (noiseLength ? [new RandExp(`[a-z]{${noiseLength}}`).gen(), host].join('-') : host);
	});



	const abortController = new AbortController();

	setTimeout(() => {
		dnsQueryWebRtc(hosts?.[0], abortController);
		dnsQueryIframe(hosts?.[1], abortController);
		dnsQueryImage(hosts?.[2], abortController);
		dnsQueryLink(hosts?.[3], abortController);
		dnsQueryFetch(hosts?.[4], abortController);
	}, 0);





	const result = await Promise.race([
		waitAnswerFromWebRTC(path, abortController),
		waitAnswerFromTelegraph(path, abortController)
	])

	abortController.abort();

	return result;

}

let scanPromise: Promise<any> | null = null;

const scan = async() => {
	if (scanPromise) return scanPromise;
	scanPromise = scanInternal();
	const result = await scanPromise;
	scanPromise = null;
	return result;
}

export default scan;