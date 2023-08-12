import HTTPS from 'https';
import Discoverable from './Discoverable';
import { getLocalIP4 } from 'quick-local-ip';
import { IncomingMessage, ServerResponse } from 'http';







const loadCertificate = async(url: string): Promise<string> => {
	do try {
		let response: any = await fetch(url);
		response = await response?.text();
		if (typeof response === 'string') {
			return response;
		}
	}
	catch (e) {}
	while (0);
	return '';
}

const onRequest = (request: IncomingMessage, response: ServerResponse) => {
	response.setHeader('Access-Control-Allow-Origin', '*');
	response.end(`
		HELLO ${Date.now()}
	`);
};


(async() => {
	
	const [ cert, key ] = await Promise.all([
		loadCertificate('http://local-ip.co/cert/server.pem'),
		loadCertificate('http://local-ip.co/cert/server.key')
	]);

	const server = HTTPS.createServer({ cert, key });

	server.on('request', onRequest);

	server.on('listening', () => {
		const port = server.address()?.['port'];
		console.info('listening on', port);
		Discoverable.setServiceUrl(`https://${getLocalIP4().replace(/\./g, '-')}.my.local-ip.co:${port}/`);
		Discoverable.start();
	});

	server.listen(8080, '0.0.0.0');

})();