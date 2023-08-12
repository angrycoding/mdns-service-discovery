import Scan from 'mdns-service-discovery-client';
import React, { useState } from 'react';

export default () => {

	const [ response, setResponse ] = useState('');
	const [ isScanning, setIsScanning ] = useState(false);
	const [ activeNodes, setActiveNodes ] = useState<any>([]);

	const doScan = async() => {
		setIsScanning(true);
		// const result = await getMyIp();
		// setResponse(result);

		const result = await Scan();
		setActiveNodes(result)

		if (result.length) {
			console.info('REQUEST_FIRST');
			const x = await fetch(result[0]);
			setResponse(await x?.text());
			
		}
		setIsScanning(false);
	}

	return (
		<div style={{
			position: 'fixed',
			top: 0,
			left: 0,
			right: 0,
			bottom: 0,
			display: 'flex',
			flexDirection: 'column',
			alignContent: 'center',
			alignItems: 'center',
			justifyContent: 'center'
		}}>
			
			<button onClick={doScan} style={{fontSize: '200%'}} disabled={isScanning}>
				SCAN
			</button>

			<div style={{whiteSpace: 'pre-wrap'}}>
				{JSON.stringify(activeNodes, null, '\t')}
			</div>

			<div style={{border: '1px solid red'}}>
				{JSON.stringify(response)}
			</div>

	</div>);
}
