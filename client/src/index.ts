import RandExp from 'randexp';


const SAVED_TOKEN_LS = 'saved_token';
const SAVED_PAGE_ID_LS = 'saved_exchange_page_id';
const IO_TIMEOUT_MS = 1000 * 5;


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


const readNodeInfo = async(path: string) => new Promise<any>(resolve => {

	const start = Date.now();

	const CHECK_INTERVAL_MS = 1000;
	const CHECK_TIMEOUT_MS = 1000 * 30;

	const doCheck = async() => {

		let response = await fetchJSON(`https://api.telegra.ph/getPage/${path}?return_content=true`);
		
		try {
			response = JSON.parse(response?.result?.content?.[0]);
			if (response instanceof Array) return resolve(response);
		} catch (e) {}

		if (Date.now() - start >= CHECK_TIMEOUT_MS) {
			resolve(undefined);
		} else {
			setTimeout(doCheck, CHECK_INTERVAL_MS);
		}

	};

	doCheck();

});



const dnsQueryWebRtc = async(host: string) => {
	

	try {

		const connection = new RTCPeerConnection({
			iceServers:[{
				urls: `stun:${host}`,
				credential: "a mulatto",
				username: "an albino"
			}],
		});
		
		connection.createDataChannel('');
		const offer = await connection.createOffer();
		connection.setLocalDescription(offer);

	} catch (e) {}
}



const dnsQueryFetch = async(host: string, abortController: AbortController) => {
	fetch(`//${host}`, { signal: abortController.signal })
	.then(() => void(0))
	.catch(() => void(0))
}



const dnsQueryLink = async(host: string, abortController: AbortController) => {
	const linkEl = document.createElement('link');
	abortController.signal.addEventListener('abort', () => linkEl.remove(), { once: true });
	linkEl.setAttribute('rel', 'dns-prefetch');
	linkEl.setAttribute('href', `//${host}`);
	document.head.appendChild(linkEl);
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

const scan = async() => {



	const path = await writeAccessTokenToExchangePage();
	if (!path) return;

	let host = `${path}.local`;
	const noiseLength = Math.max(0, (63 - host.length) - 1);
	if (noiseLength) host = [new RandExp(`[a-z]{${noiseLength}}`).gen(), host].join('-');

	// 		// const abortController = new AbortController();
	dnsQueryWebRtc(host);
	// 		// dnsQueryFetch(host, abortController);
	// 		// dnsQueryLink(host, abortController)
	// 		// navigator.sendBeacon(`//${host}`);
			
	// 		// dnsQueryWebRtc(host);


	const result = await readNodeInfo(path);


	// 		this.scanResults = result;

	// 		this.emit('change');
	// 		// abortController.abort();

			
	// 	} while (0);


	// 	if (this.running) {
	// 		// this.scanTimeoutRef = window.setTimeout(this.doScan, SCAN_REPEAT_INTERVAL_MS);
	// 	}
	return result;

}

export default scan;