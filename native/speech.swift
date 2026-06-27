import Foundation
import Speech
import AVFoundation

setbuf(stdout, nil)

func emit(_ line: String) {
    print(line)
}

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(("ERROR:" + message + "\n").data(using: .utf8)!)
    exit(1)
}

let localeId = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "pt-BR"

guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: localeId)) else {
    fail("locale-unsupported")
}
if !recognizer.isAvailable {
    fail("recognizer-unavailable")
}

let group = DispatchGroup()
group.enter()

var speechAuthorized = false
SFSpeechRecognizer.requestAuthorization { status in
    speechAuthorized = status == .authorized
    group.leave()
}
group.wait()

if !speechAuthorized {
    fail("speech-permission-denied")
}

let group2 = DispatchGroup()
group2.enter()
var micAuthorized = false
AVCaptureDevice.requestAccess(for: .audio) { granted in
    micAuthorized = granted
    group2.leave()
}
group2.wait()

if !micAuthorized {
    fail("microphone-permission-denied")
}

let audioEngine = AVAudioEngine()
let request = SFSpeechAudioBufferRecognitionRequest()
request.shouldReportPartialResults = true

let inputNode = audioEngine.inputNode
let recordingFormat = inputNode.outputFormat(forBus: 0)
inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { buffer, _ in
    request.append(buffer)
}

audioEngine.prepare()
do {
    try audioEngine.start()
} catch {
    fail("audio-engine-start-failed:\(error)")
}

emit("READY")

var lastPartial = ""

func shutdown() {
    if audioEngine.isRunning {
        audioEngine.stop()
        inputNode.removeTap(onBus: 0)
    }
}

let task = recognizer.recognitionTask(with: request) { result, error in
    if let result = result {
        let text = result.bestTranscription.formattedString
        if text != lastPartial {
            lastPartial = text
            emit("PARTIAL:\(text)")
        }
        if result.isFinal {
            emit("FINAL:\(text)")
            shutdown()
            exit(0)
        }
    }
    if let error = error {
        FileHandle.standardError.write(("ERROR:recognition-error:\(error)\n").data(using: .utf8)!)
        shutdown()
        exit(1)
    }
}

DispatchQueue.global(qos: .userInitiated).async {
    while let line = readLine(strippingNewline: true) {
        if line == "STOP" {
            request.endAudio()
            break
        }
    }
}

signal(SIGINT) { _ in
    shutdown()
    exit(0)
}
signal(SIGTERM) { _ in
    shutdown()
    exit(0)
}

dispatchMain()
