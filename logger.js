const Parser = require('./utilities/teltonika-parser');
const binutils = require('binutils64');
const net = require('net');
const Devices = require('./device/devices')
const prompt = require('prompt-sync')
const crc16ibm = require('./utilities/crc16ibm')
const GprsCommandPacker = require("./utilities/gprsCommandPacker")
const fs = require('fs')
const myRL = require("serverline")
require('log-timestamp')
process.env.TZ = "Asia/Manila"

class Logger{
    constructor (){
        this.devices = new Devices()
        var devlist_path = ('./device/devlist.json')
        var devlist_json = require(devlist_path)
        var inst = this
        
        for (const [key, device] of Object.entries(devlist_json['devices'])) {
            this.devices.addDevice(device.imei, null, device.id)
            console.log("Device " + device.id + " loaded")
        }
        let server = net.createServer((c) => {
            //console.log("client connected");
            //console.log(c)
            //let id = this.devices.addDevice(c);
            //console.log("New device connected")
            //console.log("ID: " + id)
            //console.log("IP: " + c.remoteAddress + ":" + c.remotePort)

            //c.id = id++; 
            c.on('end', () => {
                let id = this.devices.getDeviceBySocket(c).id
                console.log("Device " + id + " disconnected");
                this.devices.setDeviceReady(id, false);
                //this.devices.removeDeviceBySocket(c);
                //clients
            });
        
            c.on('data', (data) => {
                //console.log("Received: " + data.toString("hex"));
                //console.log("Received data from Address: " + c.remoteAddress + ":" + c.remotePort);
                
                //console.log("From Device " + id);
                //console.log(c)

                
                let buffer = data;
                let parser = new Parser(buffer);
                if(parser.isImei){
                    let id = -1
                    let dev = this.devices.getDeviceByImei(parser.imei)
                    if (dev){
                        dev.updateSocket(c)
                        id = dev.id
                        this.devices[id] = dev
                        console.log("Device " + id + " reconnected")
                    }
                    else{
                        id = this.devices.addDevice(parser.imei, c)
                        console.log("New device added; ID: " + id + "; IMEI: " + parser.imei)   
                        devlist_json['devices'].push({"id":id,"imei":parser.imei});
                        let stream = fs.createWriteStream(devlist_path, {flags:'w'});
                        stream.write(JSON.stringify(devlist_json))
                    }
                    
                    //console.log("Received IMEI from device " + id);
                    c.write(Buffer.alloc(1,1));
                   
                    this.devices.setDeviceReady(id)
                    console.log("Device " + id + " is ready for communication") 
                }
                else {
                    let device = this.devices.getDeviceBySocket(c)
                    let id = device.id
                    let header = parser.getHeader();
                    //console.log("CODEC: " + header.codec_id);
        
                    if(header.codec_id == 12){
                        console.log("Received GPRS message from device  " + id)
                        let gprs = parser.getGprs()
                        

                        console.log("Type: " + gprs.type + "; Size: " + gprs.size + "\nMessage: " + gprs.response)
                        //this.devices.pushGprsRecord(id, gprs);
                    }
                    else if(header.codec_id == 142){
                        let avl = parser.getAvl()

                        console.log("Received AVL data from device " + id);
                        let stream = fs.createWriteStream("dev"+id+"-log.txt", {flags:'a'});
                        stream.write(data.toString("hex")+"\n");
                        //console.log("AVL Zero: " + avl.zero);
                        //console.log("AVL Data Length: " + avl.data_length);
                        //console.log("AVL Codec ID: " + avl.codec_id);
                        //console.log("AVL Number of Data: " + avl.number_of_data);
                        //console.log("AVL Data[0] timestamp: " + avl.records[0].timestamp)
                        //this.devices.pushAvlRecord(id, avl);
                        let writer = new binutils.BinaryWriter();
                        writer.WriteInt32(avl.number_of_data);
        
                        let response = writer.ByteBuffer;
                        c.write(response);
                    }
                        
                }
            });
        });
        
        
        server.listen(49366, () => {
            console.log("Server started");
        });

        let commandReceiver = net.createServer((c) => {
            c.on("end", () => {
                console.log("ui disconnected")
            });

            c.on('data', (ui_message) => {
                console.log("ui message: " + ui_message)
                //c.write("SAMPLE RESPONSE FROM LOGGER")
                inst._process_message(ui_message, c, inst)
            });
        })

        commandReceiver.listen(49365, () => {
            console.log("Waiting for command from ui...")
        })
    }

    _process_message(ui_message, c, inst){
        //let inst = this
        let user_input = ui_message.toString().trim()
        let [ui_command, id, ...others] = user_input.split(" ");
        let message = others.join(" ");

        //console.log("Command: " + comm);
        //console.log("ID: " + id);
        //console.log("Message: " + message);

        if (ui_command == "sendCommand"){
            let gprsCommandPacker = new GprsCommandPacker(message)
            let outBuffer = gprsCommandPacker.getGprsMessageBuffer()

            let dev = inst.devices.getDeviceByID(id)

            if (dev !== undefined){
                if(dev.isReady){
                    c.write("'" + message + "' sent to device " + id);
                    inst.devices.sendMessageToDevice(id, outBuffer);
                }
                else{
                    c.write("Device " + id + " is currently disconnected")
                }
                
            }
            else{
                c.write("Device " + id + " not found")
            }
        }
        else if (ui_command == "listDevices"){
            inst.devices.printDevices(c)
        }
        else if (ui_command == "printLatestGPRS"){
            if(id){
                inst.devices.printLatestGprs(id, c)
            }
            else{
                c.write("Please specify a device id")
            }
        }
    }

}

inst = new Logger()