const metadata_header_size = 21; // msg_len(4), svc_demoinfo(1), demoinfo_len(4), metadata_start(4), metadata_len(4), metadata_max_len(4)

const versions = [
  {
    name: "Warsow 2.1",
    ext: "wdz20",
    basegame: "basewsw",
    game_protocol: 20,
    demo_protocol: 20,
    gzipped: true,
    metadata_size: 16 * 1024,
  },
  {
    name: "Warfork 2.1",
    ext: "wfdz20",
    basegame: "basewf",
    game_protocol: 20,
    demo_protocol: 20,
    gzipped: true,
    metadata_size: 16 * 1024,
  },
  {
    name: "Warfork 2.13",
    ext: "wfdz21",
    basegame: "basewf",
    game_protocol: 21,
    demo_protocol: 21,
    gzipped: false,
    metadata_size: 4 * 1024,
  },
  {
    name: "Warfork 2.15",
    ext: "wfdz22",
    basegame: "basewf",
    game_protocol: 27,
    demo_protocol: 22,
    gzipped: false,
    metadata_size: 4 * 1024,
  },
];

let current_demo = {
  demo: null,
  version: null,
  filename: null,
};

function init() {
  document.body.innerHTML = "Convert warsow/warfork demos, drop file anywhere etc...";
}
function invalid( msg ) {
  document.body.innerHTML = `Couldn't read this file... <pre>${ msg }</pre>`;
}
function showOptions() {
  let html = `<div>Demo loaded: <b>${ current_demo.filename }</b> (${ current_demo.version.name })</div>`;
  html += "<div>Convert to:<br>";
  for( let version of versions ) {
    html += `<button onclick="downloadVersion( '${ version.ext }' )">${ version.name }</button><br>`;
  }
  html += "</div>";
  document.body.innerHTML = html;
}
document.addEventListener('DOMContentLoaded', init );
document.ondragover = e => {
  e.preventDefault();
}

function Uint8ArrayToString( u8a ){
  var c = [];
  for ( let i = 0; i < u8a.length; i ++ ) {
    c.push( String.fromCharCode( u8a[ i ] ) );
  }
  return c.join( "" );
}

function StringToUint8Array( str ){
  const buf = new Uint8Array( str.length );
  for( let i = 0; i < str.length; i++ ) {
    buf[ i ] = str.charCodeAt( i );
  }
  return buf;
}

function readUintAt( arr, ofs ) {
  return (
  ( arr[ ofs + 3 ] << 24 ) +
  ( arr[ ofs + 2 ] << 16 ) +
  ( arr[ ofs + 1 ] << 8 ) +
  arr[ ofs + 0 ] >>> 0 )
}

function writeUintAt( arr, ofs, int ) {
  arr[ ofs + 0 ] = ( int >> 0 ) & 0xFF;
  arr[ ofs + 1 ] = ( int >> 8 ) & 0xFF;
  arr[ ofs + 2 ] = ( int >> 16 ) & 0xFF;
  arr[ ofs + 3 ] = ( int >> 24 ) & 0xFF;
}

function readStringAt( arr, ofs ) {
  let str = "";
  while( arr[ ofs ] != 0 ) {
    str += String.fromCharCode( arr[ ofs ] );
  }
  return str;
}

function getVersionFromExtension( ext ) {
  for( const version of versions ) {
    if( ext == version.ext )
      return version;
  }
}

function loadDemo( file, version ) {
  if( version.gzipped ) {
    file = pako.ungzip( file );
  } else {
    file = new Uint8Array( file );
  }

  let cursor = 0;
  const demo = {
    metadata_header: file.slice( cursor, cursor += metadata_header_size ),
    metadata: file.slice( cursor, cursor += version.metadata_size ),
    packets: file.slice( cursor ),
  };

  return demo;
}

function convertDemo( demo, version_from, version_to ) {
  if( version_from.game_protocol != version_to.game_protocol )
    writeUintAt( demo.packets, 5, version_to.game_protocol );

  if( version_from.basegame != version_to.basegame ) {
    demo.packets = StringToUint8Array( Uint8ArrayToString( demo.packets ).replace( version_from.basegame, version_to.basegame ) );
    writeUintAt( demo.packets, 0, readUintAt( demo.packets, 0 ) + version_to.basegame.length - version_from.basegame.length );
  }

  if( version_from.metadata_size > version_to.metadata_size ) {
    demo.metadata = demo.metadata.slice( 0, version_to.metadata_size );
  }
  if( version_from.metadata_size < version_to.metadata_size ) {
    let new_metadata = new Uint8Array( version_to.metadata_size );
    new_metadata.set( demo.metadata );
    demo.metadata = new_metadata;
  }
  if( version_from.metadata_size != version_to.metadata_size ) {
    // msg_len(4), svc_demoinfo(1), demoinfo_len(4), metadata_start(4), metadata_len(4), metadata_max_len(4)
    writeUintAt( demo.metadata_header, 0, version_to.metadata_size + 17 ); // msg_len
    writeUintAt( demo.metadata_header, 17, version_to.metadata_size ); // metadata_max_len
  }

  return demo;
}

async function saveDemo( demo, version ) {
  if( version.gzipped ) {
    const file_gz_header = new Uint8Array( [ 0x1F, 0x8B, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 ] );
    const full_metadata = new Uint8Array( await new Blob( [ demo.metadata_header, demo.metadata ] ).arrayBuffer() );
    return new Blob( [ file_gz_header, pako.gzip( full_metadata, { level: 0 } ), pako.gzip( demo.packets ) ] );
  } else {
    return new Blob( [ demo.metadata_header, demo.metadata, demo.packets ] );
  }
}

async function downloadVersion( ext ) {
  const version = getVersionFromExtension( ext );
  convertDemo( current_demo.demo, current_demo.version, version );
  const blob = await saveDemo( current_demo.demo, version );

  const url = URL.createObjectURL( blob );
  const a = document.createElement( "a" );
  a.href = url;
  a.download = `${ current_demo.filename }-converted.${ version.ext }`;
  a.click();
  URL.revokeObjectURL( url );
}

document.ondrop = async e => {
  e.preventDefault();
  if ( e.dataTransfer.files.length != 1 ) return;
  document.body.innerText = "loading...";
  const file = e.dataTransfer.files[0];
  const reader = new FileReader();

  reader.onload = e => {
    let original_file = reader.result;

    const ext = file.name.split( "." ).pop();
    const version = getVersionFromExtension( ext );
    if ( version == null ) return invalid( "unknown file extension" );

    try {
      current_demo.filename = file.name.split( "." ).slice( 0, -1 ).join( "." );
      current_demo.version = version;
      current_demo.demo = loadDemo( original_file, version );

      showOptions();
    } catch( e ) {
      invalid( e.message );
    }
  }
  reader.readAsArrayBuffer( file );
}