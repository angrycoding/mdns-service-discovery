const dnsPacket = require('dns-packet')


var udp = require('dgram');

// --------------------creating a udp server --------------------

// creating a udp server
var server = udp.createSocket({type: 'udp4', reuseAddr: true});

// emits when any error occurs
server.on('error',function(error){
  console.log('Error: ' + error);
  server.close();
});

// emits on new datagram msg
server.on('message', (msg, info) => {

	const packet = dnsPacket.decode(msg);
	let questions = packet.questions;
	questions = (questions instanceof Array ? questions : []).map(question => {
		const name = question.name;
		if (typeof name !== 'string') return;
		let data = name.match(/([0-9]{1,3}-[0-9]{1,3}-[0-9]{1,3}-[0-9]{1,3})\.iot\.videotam\.ru/);
		if (!(data instanceof Array) || data.length !== 2) return;
		data = data[1];
		if (typeof data !== 'string') return;
		return { name, data: data.replace(/-/g, '.') };
	}).filter(a => a);
	if (!questions.length) return;

	const responseObj = {
		id: packet.id,
		type: 'response',
		questions: packet.questions,
		answers: questions.map(question => ({
			type: 'A',
			class: 'IN',
			ttl: 604800,
			name: question.name,
			data: question.data
		}))
	};

	const responseEncoded = dnsPacket.encode(responseObj);

	const responseDecoded = dnsPacket.decode(responseEncoded);

	console.info(responseDecoded);



	server.send(
		responseEncoded,
		0,
		responseEncoded.length,

		info.port,
		info.address,
		error => {
			console.info('ERROR', error)
		}
	
	)
	// console.info(info)

	
	// console.info('questions', questions)
});

//emits when socket is ready and listening for datagram msgs
server.on('listening',function(){
  var address = server.address();
  var port = address.port;
  var family = address.family;
  var ipaddr = address.address;
  console.log('Server is listening at port' + port);
  console.log('Server ip :' + ipaddr);
  console.log('Server is IP4/IP6 : ' + family);
});

//emits after the socket is closed using socket.close();
server.on('close',function(){
  console.log('Socket is closed !');
});

server.bind(53, '212.193.57.111');
