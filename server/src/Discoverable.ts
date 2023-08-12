import Datagram from 'dgram';
import DNSPacket from 'dns-packet';
import Puppeteer from 'puppeteer';



let SERVICE_URL: string = '';
const TTL_S = 10;
const MULTICAST_PORT = 5353;



const MULTICAST_ADDR = '224.0.0.251';
const DEVICES_AROUND = [];
const MAX_DEVICES_AROUND = 10;
const MAX_DEVICE_LIFETIME_MS = 1000 * 30;
const SEND_PRESENCE_INTERVAL_MS = 5000;
const BIND_TIMEOUT_MS = 1000 * 10;

let isRunning = false;
let sendPresenceTimeoutRef: NodeJS.Timeout;
let mdnsSocket: Datagram.Socket | null = null;

const closeSocket = () => new Promise<void>(resolve => {
	if (!mdnsSocket) return resolve();
	mdnsSocket.unref();
	mdnsSocket.removeAllListeners();
	const cleanupAndReturn = () => (mdnsSocket = null, resolve());
	try { mdnsSocket.disconnect() } catch (e) {}
	try { mdnsSocket.close(cleanupAndReturn); }
	catch (e) { cleanupAndReturn() }
});

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



const onPresenceReceived = (url: string) => {
	if (!isRunning) return;
	const now = Date.now();
	DEVICES_AROUND.splice(0, Infinity, ...DEVICES_AROUND.filter(device => {
		if (now - device.when > MAX_DEVICE_LIFETIME_MS) return false;
		if (device.url === url) return false;
		return true;
	}));
	DEVICES_AROUND.push({ when: Date.now(), url });
	DEVICES_AROUND.splice(0, Math.max(DEVICES_AROUND.length - MAX_DEVICES_AROUND, 0));
}

const sendPresence = async() => {

	if (!isRunning) return;
	
	mdnsSocket.send(DNSPacket.encode({
		id: 0,
		type: 'response',
		flags: DNSPacket.RECURSION_DESIRED,
		additionals: [{
			name: 'url',
			type: 'NULL',
			data: SERVICE_URL
		}]
	}), MULTICAST_PORT, MULTICAST_ADDR, (error) => {
		if (!isRunning) return;
		if (error) console.error('broadcast error')
		sendPresenceTimeoutRef = setTimeout(sendPresence, SEND_PRESENCE_INTERVAL_MS);
	});

}


const answerWithWebRTC = async(path: string, data: any) => {

	console.info('answerWithWEBRTC', path, data)

	const browser = await Puppeteer.launch({
		headless: 'new'
		// headless: false
	});

	const page = await browser.newPage();

	await page.exposeFunction('close', () => {
		browser.close();
	});

	page.goto(`data:text/html;,
		<script src="https://unpkg.com/peerjs@1.4.7/dist/peerjs.min.js"></script>
		<script>
			const peer = new Peer();

			peer.on('open', function(id) {
				console.log('My peer ID is: ' + id);
				var conn = peer.connect(${JSON.stringify(path)});
				conn.on('open', () => {
					console.info('connected');
					conn.send(${JSON.stringify(data)});
					window.close();
				});
			});
		</script>
	`)

}

const answerWithTelegraph = async(path: string, data: any) => {

	const editPage = async(accessToken: string, path: string, content: any): Promise<string> => {

		try {
	
			let response: any = await fetch(`https://api.telegra.ph/editPage/${path}?${new URLSearchParams({
				access_token: accessToken.toString(),
				title: String(Date.now()),
				content: JSON.stringify([content])
			}).toString()}`);
	
			if (!response) return '';
			
			response = await response.json();
	
			if (response?.ok === true && response?.result?.path === path) return path;
	
		} catch (e) {}
		
		return '';
	}
	

	let response: any = await fetch(`https://api.telegra.ph/getPage/${path}?return_content=true`);
	response = await response?.json();
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



		console.info('RESPONDING...');

		await Promise.all([
			answerWithWebRTC(path, DEVICES_AROUND.map(device => device.url)),
			answerWithTelegraph(path, DEVICES_AROUND.map(device => device.url))
		])

	}

})();

const onMessage = (data, from) => {

	if (!isRunning) return;

	const packet = DNSPacket.decode(data);
	// console.info('packet', JSON.stringify(packet, null, '\t'));

	// return;

	const url = packet?.additionals?.find(item => item?.type === 'NULL' && item?.name === 'url')?.data?.toString();
	if (typeof url === 'string') {
		onPresenceReceived(url);
	}

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



const start = async(): Promise<boolean> => {
	if (isRunning) return;
	console.info('starting...');
	isRunning = await bindSocket();


	// if (mdnsSocket) {
	// 	mdnsSocket.addMembership(
	// 		MULTICAST_ADDR,
	// 		'192.168.1.109'
	// 	  );
	// 	}
	if (isRunning) {
		if (mdnsSocket) {
			// mdnsSocket.setMulticastTTL(200);
			// mdnsSocket.setMulticastLoopback(false);
		}
		mdnsSocket.on('message', onMessage);
		mdnsSocket.once('error', () => {
			console.info('SOCKET_ERROR')
		});
		isRunning = true;
		sendPresence();
	}
	return isRunning;
};

const stop = async(): Promise<void> => {
	DEVICES_AROUND.splice(0, Infinity);
	clearTimeout(sendPresenceTimeoutRef);
	sendPresenceTimeoutRef = null;
	await closeSocket();
	isRunning = false;
}


const getDevices = () => {
	const now  = Date.now()
	return (
		DEVICES_AROUND
		.filter(device => now - device.when <= MAX_DEVICE_LIFETIME_MS)
		.map(device => ({ ...device, when: undefined }))
	);
}

const setServiceUrl = (url: string) => {
	SERVICE_URL = url.trim().toLowerCase();
}

export default {
	setServiceUrl,
	start,
	stop,
	getDevices
}