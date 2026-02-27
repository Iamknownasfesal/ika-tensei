import Irys from '@irys/sdk';

const irys = new Irys({
  network: 'devnet',
  token: 'solana',
  key: 's96W3Dx2FV8HDzWY1jD7z1GtfVS6DyUCXRdH4WzueXw1s7ER7RMXeyUN8Nd7Zo9eu2jLz5QtaL9nFhqo9ZnFDyz',
  config: { providerUrl: 'https://api.devnet.solana.com' },
});
await irys.ready();
console.log('Irys ready, balance:', (await irys.getLoadedBalance()).toString());

// 1. Fetch source metadata
console.log('\nFetching source metadata...');
const resp = await fetch('https://www.miladymaker.net/milady/json/1');
const raw = await resp.json();
console.log('Source name:', raw.name);
console.log('Source image:', raw.image?.substring(0, 80));
console.log('Attributes:', raw.attributes?.length);

// 2. Transform to Reborn format
const metadata = {
  name: raw.name || 'Milady #42',
  symbol: 'REBORN',
  description: raw.description || 'Reborn NFT from Milady Maker',
  image: raw.image,
  attributes: raw.attributes,
  properties: {
    category: 'image',
    creators: [{ address: '4nMLxEsHYGuj1GfFXbn1aowPVbeeqmY3i6BjtMmX4LaU', share: 100 }],
    files: [],
  },
  ika_tensei: {
    source_chain: 'base',
    source_contract: '0x993C47d2a7cBf2575076c239d03adcf4480dA141',
    source_token_id: '42',
    bridged_via: 'ika-2pc-mpc',
  },
};

// 3. Upload image to Arweave
console.log('\nUploading image to Arweave...');
let imageUri = raw.image;
if (imageUri && !imageUri.startsWith('https://arweave.net/')) {
  let fetchUrl = imageUri;
  if (imageUri.startsWith('ipfs://')) fetchUrl = 'https://ipfs.io/ipfs/' + imageUri.slice(7);
  const imgResp = await fetch(fetchUrl, { signal: AbortSignal.timeout(30000) });
  const contentType = imgResp.headers.get('content-type') || 'image/png';
  const imgBuf = Buffer.from(await imgResp.arrayBuffer());
  console.log('Image size:', imgBuf.length, 'bytes, type:', contentType);
  const imgReceipt = await irys.upload(imgBuf, { tags: [{ name: 'Content-Type', value: contentType }, { name: 'App-Name', value: 'ika-tensei' }] });
  imageUri = 'https://arweave.net/' + imgReceipt.id;
  console.log('Image uploaded:', imageUri);
}

// 4. Upload metadata JSON
metadata.image = imageUri;
metadata.properties.files = [{ uri: imageUri, type: 'image/png' }];
const jsonBuf = Buffer.from(JSON.stringify(metadata));
console.log('\nUploading metadata JSON (' + jsonBuf.length + ' bytes)...');
const metaReceipt = await irys.upload(jsonBuf, { tags: [{ name: 'Content-Type', value: 'application/json' }, { name: 'App-Name', value: 'ika-tensei' }] });
const metadataUri = 'https://arweave.net/' + metaReceipt.id;
console.log('Metadata uploaded:', metadataUri);
console.log('URI length:', metadataUri.length, '(Solana limit: 512)');
