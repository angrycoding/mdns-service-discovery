import HTTPS from 'https';
import { getCertificates, start } from '../../server/src/index';
import { IncomingMessage, ServerResponse } from 'http';



const onRequest = (request: IncomingMessage, response: ServerResponse) => {
	response.setHeader('Access-Control-Allow-Origin', '*');
	response.end(`
		HELLO ${Date.now()}
	`);
};


(async() => {

	const certs = await getCertificates();

	console.info(
		certs
	)

	const server = HTTPS.createServer(
		certs
	);

	server.on('request', onRequest);

	server.listen(0, '0.0.0.0', async() => {
		const port = server.address()?.['port'];
		console.info('listening on', port);
		console.info('start discoverable', await start(port));
	})

})();