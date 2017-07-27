# P2P.NET
Peer to peer networking in C# using WebRTC

This is designed to be pretty easy to use, here is an example:

```C#

class SampleUsage
{
    Peer myPeer;
    public SampleUsage() {
        // I'll explain how to make a signaling server on Heroku in a bit
        myPeer = new Peer("ws://sample-bean.herokuapp.com", "anystring this is your room id");
        myPeer.OnBytesFromPeer += Peer_OnBytesFromPeer;
        myPeer.OnConnection += Peer_OnConnection;
        myPeer.OnDisconnection += Peer_OnDisconnection;
        myPeer.OnGetID += Peer_OnGetID;
        myPeer.OnTextFromPeer += Peer_OnTextFromPeer;
    }

    void Peer_OnGetID(string id)
    {
        Console.WriteLine("my id is " + id);
    }

    void Peer_OnConnection(string peer)
    {
        Console.WriteLine(peer + " connected");
    }

    void Peer_OnDisconnection(string peer)
    {
        Console.WriteLine(peer + " disconnected");
    }

    void Peer_OnTextFromPeer(string peer, string text)
    {
        Console.WriteLine(peer + " sent " + text);
    }

    void Peer_OnBytesFromPeer(string peer, byte[] bytes)
    {
        Console.WriteLine(peer + " sent " + bytes.Length + " bytes");
    }

    // Call peer.Dispose() when you are done using it
    void OnClose()
    {
        myPeer.Dispose(); // it is fine to call this more then once
    }
    
    // Call peer.Update() often (every frame is fine). It will call your callbacks on the thread you call Update()
    void Tick ()
    {
        myPeer.Update();
    }
}
  ```
All the work is done on a seperate thread (that is then passed to thread-safe queues that are dequeued when you call `Update()`) so it is all non-blocking  
