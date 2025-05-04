import { connection, server as WebSocketServer } from "websocket";
import http from "http";
import { UserManager } from "./userManager";
import {
  IncomingMessages,
  SupportedMessage,
} from "./messages/incomingMessages";
import { InMemoryStore } from "./store/InMemoryStore";
import {
  OutgoingMessages,
  SupportedMessage as OutgoingSupportedMessages,
} from "./messages/outgoingMessages";

const server = http.createServer(function (request: any, response: any) {
  console.log(new Date() + " Received request for " + request.url);
  response.writeHead(404);
  response.end();
});
const userManager = new UserManager();
const store = new InMemoryStore();
server.listen(8081, function () {
  console.log(new Date() + " Server is listening on port 8081");
});

const wsServer = new WebSocketServer({
  httpServer: server,
  // You should not use autoAcceptConnections for production
  // applications, as it defeats all standard cross-origin protection
  // facilities built into the protocol and the browser.  You should
  // *always* verify the connection's origin and decide whether or not
  // to accept it.
  autoAcceptConnections: false,
});

function originIsAllowed(origin: string) {
  // put logic here to detect whether the specified origin is allowed.
  return true;
}

wsServer.on("request", function (request) {
  // console.log("inside connect");

  if (!originIsAllowed(request.origin)) {
    // Make sure we only accept requests from an allowed origin
    request.reject();
    console.log(
      new Date() + " Connection from origin " + request.origin + " rejected."
    );
    return;
  }

  var connection = request.accept("echo-protocol", request.origin);
  console.log(new Date() + " Connection accepted.");
  connection.on("message", function (message) {
    // console.log(message);
    if (message.type === "utf8") {
      try {
        // console.log("indie with msg" + message.utf8Data);
        messageHandler(connection, JSON.parse(message.utf8Data));
      } catch (e) {}
      // console.log('Received Message: ' + message.utf8Data);
      // connection.sendUTF(message.utf8Data);
    }
  });
  //   connection.on("close", function (reasonCode, description) {
  //     console.log(
  //       new Date() + " Peer " + connection.remoteAddress + " disconnected."
  //     );
  //   });
});

function messageHandler(ws: connection, message: IncomingMessages) {
  // console.log("incmng msg" + JSON.stringify(message));

  if (message.type == SupportedMessage.JoinRoom) {
    const payload = message.payload;
    userManager.addUser(payload.name, payload.userId, payload.roomId, ws);
  }

  if (message.type === SupportedMessage.SendMesssage) {
    const payload = message.payload;
    const user = userManager.getUser(payload.roomId, payload.userId);
    if (!user) {
      console.error("User not found in the db");
      return;
    }
    let chat = store.addChat(
      payload.userId,
      user.name,
      payload.roomId,
      payload.message
    );
    
    if (!chat) {
      return;
    }
    const outgoingPayload: OutgoingMessages = {
      type: OutgoingSupportedMessages.AddChat,
      payload: {
        chatId: chat.id,
        roomId: payload.roomId,
        message: payload.message,
        name: user.name,
        upvotes: 0,
      },      
    };

    
    userManager.broadcast(payload.roomId, payload.userId, outgoingPayload);
  }

  if (message.type === SupportedMessage.UpvoteMessage) {
    const payload = message.payload;
    const chat = store.upvote(payload.userId, payload.roomId, payload.chatId);
    if (!chat) {
      return;
    }
    const outgoingPayload: OutgoingMessages = {
      type: OutgoingSupportedMessages.UpdateChat,
      payload: {
        chatId: payload.chatId,
        roomId: payload.roomId,
        upvotes: chat.upvotes.length,
      },
    };

    userManager.broadcast(payload.roomId, payload.userId, outgoingPayload);
  }
}
