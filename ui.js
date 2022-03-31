const Parser = require('teltonika-parser-ex');
const binutils = require('binutils64');
const net = require('net');
const { parse } = require('path');
const ByteBuffer = require("bytebuffer");
var id = 0;

let server = net.createServer((c) => {
    console.log("client connected");

    //c.id = id++; 
    c.on('end', () => {
        console.log("client disconnected");
        //clients
    });

    c.on('data', (data) => {
        //console.log("Received: " + data.toString("hex"));
	console.log("Address: " + c.remoteAddress + ":" + c.remotePort);
        let buffer = data;
        let parser = new Parser(buffer);
        if(parser.isImei){
	    console.log("Received data is IMEI");
            c.write(Buffer.alloc(1,1));
        }else {
            let avl = parser.getAvl();
	    console.log("CODEC: " + avl.codec_id);
	    if(avl.codec_id == 255){
       		let writer = new binutils.BinaryWriter();
		let command = Buffer.from("000000000000000F0C010500000007676574696E666F0100004312", "hex");
                //console.log("Current buffer length: " + writer.Length);
                writer.WriteBytes(command);
                let command_message = writer.ByteBuffer;
                //let response = ByteBuffer.fromHex("000000000000000F0C010500000007676574696E666F0100004312")
                console.log("Writing test command " + command_message.toString("hex"));
                c.write(command_message);

	    }
            if(avl.codec_id == 12){
                console.log("Received GPRS response")
                let gprs = parser.getGprs()
                console.log(gprs.response)
            }
            else{
                console.log("Received data is AVL");
                console.log("AVL Zero: " + avl.zero);
                console.log("AVL Data Length: " + avl.data_length);
                console.log("AVL Codec ID: " + avl.codec_id);
                console.log("AVL Number of Data: " + avl.number_of_data);
                let writer = new binutils.BinaryWriter();
                writer.WriteInt32(avl.number_of_data);

                let response = writer.ByteBuffer;
		c.write(response);
		console.log("Writing response to AVL: " + response.toString("hex"));
            }
            
        }
    });
});

server.listen(49366, () => {
    console.log("Server started");
});

