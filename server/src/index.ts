import Datagram from 'dgram';
import DNSPacket from 'dns-packet';
import { getLocalIP4 } from 'quick-local-ip';
import Request from 'request';

const MULTICAST_ADDR = '224.0.0.251';
const MULTICAST_PORT = 5353;
const BIND_TIMEOUT_MS = 1000 * 10;

let isRunning = false;
let startPort: number = 0;
let mdnsSocket: Datagram.Socket | null = null;

const bindSocket = () => new Promise<boolean>(async(resolve) => {

	console.info('binding...');

	await closeSocket();

	mdnsSocket = Datagram.createSocket({ type: 'udp4', reuseAddr: true });

	let timeoutRef: NodeJS.Timeout = undefined;

	const returnResult = (result?: any) => {
		if (timeoutRef === undefined) return;
		clearTimeout(timeoutRef);
		timeoutRef = undefined;
		mdnsSocket.removeAllListeners();

		if (result !== true) {
			console.info('binding error', result?.message || result || 'ERROR');
		} else {
			const { address, port } = mdnsSocket.address();
			console.info('bound to', address, port);
		}

		resolve(result === true);
	}

	mdnsSocket.once('error', returnResult);
	mdnsSocket.once('listening', () => returnResult(true));
	timeoutRef = setTimeout(() => returnResult('TIMEOUT'), BIND_TIMEOUT_MS);

	try { mdnsSocket.bind(MULTICAST_PORT, MULTICAST_ADDR) }
	catch (e) { returnResult(e) }

})

const closeSocket = () => new Promise<void>(resolve => {
	if (!mdnsSocket) return resolve();
	mdnsSocket.unref();
	mdnsSocket.removeAllListeners();
	const cleanupAndReturn = () => (mdnsSocket = null, resolve());
	try { mdnsSocket.disconnect() } catch (e) {}
	try { mdnsSocket.close(cleanupAndReturn); }
	catch (e) { cleanupAndReturn() }
});

const fetchJSON = (url: string) => new Promise<any>(resolve => {
	Request(url, (error, response, body) => {
		try { return resolve(JSON.parse(body)); }
		catch (e) {}
		resolve(undefined);
	});
})

const answerWithTelegraph = async(path: string, data: any) => {

	const editPage = async(accessToken: string, path: string, content: any): Promise<string> => {

		try {

			let response: any = await fetchJSON(`https://api.telegra.ph/editPage/${path}?${new URLSearchParams({
				access_token: accessToken.toString(),
				title: String(Date.now()),
				content: JSON.stringify([content])
			}).toString()}`);

			if (response?.ok === true && response?.result?.path === path) return path;
	
		} catch (e) {}
		
		return '';
	}
	

	let response: any = await fetchJSON(`https://api.telegra.ph/getPage/${path}?return_content=true`);
	response = response?.result?.content?.[0];

	editPage(response, path, JSON.stringify(data))

}

const processDNSRequest = (() => {

	const map = {};


	return async (hostAndPath: string) => {

		for (const key in map) {
			if (Date.now() - (map?.[hostAndPath] || 0) > 1000 * 60) {
				delete map[key];
			}
		}
		
		if (map?.[hostAndPath]) return;
		map[hostAndPath] = Date.now();

		const path = hostAndPath?.slice(0, -6)?.split('-')?.slice(1)?.join('-');
		answerWithTelegraph(path, [`https://${getLocalIP4().replace(/\./g, '-')}.my.local-ip.co:${startPort}/`]);
	}

})();

const onMessage = (data, from) => {

	if (!isRunning) return;

	const packet = DNSPacket.decode(data);

	const hostToCheck = packet?.questions?.map(question => {
		let path: any = question?.name;
		if (typeof path !== 'string' || path.length !== 63) return;
		path = path?.slice(0, -6)?.split('-')?.slice(1)?.join('-');
		if (typeof path === 'string' && path.length) return question.name;
	})?.filter(a => a)?.[0];

	if (hostToCheck) {
		console.info('RECEIVED FROM', from)
		processDNSRequest(hostToCheck);
	}
	
}


// PUBLIC INTERFACE

const getCertificates = async(): Promise<{ cert: string, key: string }> => {

	const fetchText = (url: string) => new Promise<string>(resolve => {
		Request(url, function (error, response, body) {
			console.error('error:', error); // Print the error if one occurred
			console.log('statusCode:', response && response.statusCode); // Print the response status code if a response was received
			console.log('body:', body); // Print the HTML for the Google homepage.
			resolve(body);
		});
	});

	return {
		cert: await fetchText('http://local-ip.co/cert/server.pem'),
		key: await fetchText('http://local-ip.co/cert/server.key')
	}

	// return {
	// 	cert: FS.readFileSync(`${__dirname}/fullchain1.pem`, 'utf-8'),
	// 	key: FS.readFileSync(`${__dirname}/privkey1.pem`, 'utf-8')
	// }
}

const start = async(port: number, debug?: boolean): Promise<boolean> => {
	if (isRunning) return;
	console.info('starting...');
	startPort = port;
	isRunning = await bindSocket();
	if (!isRunning) return false;

	mdnsSocket.on('message', onMessage);
	mdnsSocket.once('error', () => {
		console.info('SOCKET_ERROR')
	});

	isRunning = true;

	return isRunning;
};

const stop = () => {

}

export {
	getCertificates,
	start,
	stop
}