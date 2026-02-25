export interface SignalPayload {
    offer?: RTCSessionDescriptionInit;
    answer?: RTCSessionDescriptionInit;
    candidate?: RTCIceCandidate;
}

//接收Signal
export interface SignalData {
    sender: string,
    senderName? :string,
    signal: SignalPayload,
}

export type ChatMessage = {
    id: string;
    kind: "text";
    fromID: string;     // userID
    fromName: string;   //userName
    text: string;     // msg.msg
    ts: number;       // msg.ts
} | { 
    id: string;
    kind: "file"; 
    fromID: string; 
    fromName: string; 
    fileName: string; 
    size: number; 
    mime: string; 
    url?: string; 
    status: "offer" | "transferring" | "ready" ;
    ts: number 
};


export type Messages = {
    messagesList: ChatMessage[];
    myId?: string;
    onFileClick?: (msg: Extract<ChatMessage, { kind: "file" }>) => void;
}

export type FileOffer = {
  type: "file-offer";
  id: string;
  name: string;
  size: number;
  mime: string;
  ts: number;
  fromName?: string;
};

export type FileAccept = { type: "file-accept"; id: string; fromID?: string; };
export type FileReject = { type: "file-reject"; id: string; reason?: string; fromID?: string; };
export type FileEnd = { type: "file-end"; id: string; fromID?: string; };

export type IncomingStream = {
  id: string;
  name: string;
  size: number;
  mime: string;
  received: number;
  ts: number;
  mods: 'fs' | 'blob';
  writable?: any;
  chunks?: ArrayBuffer[];
};

export type UserStatus = 'connecting' | 'connected' | 'disconnected';
export interface RoomUser {
    name: string;
    status: UserStatus;
}
