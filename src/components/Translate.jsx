import React, { useMemo, useState, useEffect, useRef } from 'react'
import { FiVolume2, FiCopy, FiRepeat, FiMic, FiStopCircle } from 'react-icons/fi'

const BASIC_LANGUAGES = [
  { code: 'es', label: 'Español' },
  { code: 'en', label: 'Inglés' },
  { code: 'fr', label: 'Francés' },
  { code: 'de', label: 'Alemán' },
  { code: 'it', label: 'Italiano' },
  { code: 'pt', label: 'Portugués' },
  { code: 'ru', label: 'Ruso' },
  { code: 'zh', label: 'Chino' },
  { code: 'ja', label: 'Japonés' },
  { code: 'ko', label: 'Coreano' },
]

const CUSTOM_LANGUAGE = { code: 'ht', label: 'Criollo haitiano' }

async function translateText(q, source, target) {
  try {
    const res = await fetch('https://es.libretranslate.com/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        q,
        source: source || 'auto',
        target,
        format: 'text',
        alternatives: 3,
        api_key: ''
      }),
    })
    if (res.ok) {
      const data = await res.json()
      return {
        text: data.translatedText || '',
        alternatives: Array.isArray(data.alternatives) ? data.alternatives : [],
        detected: data?.detectedLanguage?.language || null,
        error: null,
      }
    }
    // Fallback a MyMemory
    const mmUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(q)}&langpair=${encodeURIComponent(source)}|${encodeURIComponent(target)}`
    const mmRes = await fetch(mmUrl)
    if (!mmRes.ok) throw new Error('MyMemory no disponible')
    const mmData = await mmRes.json()
    const text = mmData?.responseData?.translatedText || q
    return { text, alternatives: [], detected: null, error: null }
  } catch (err) {
    return { text: q, alternatives: [], detected: null, error: 'No se pudo traducir con servicios disponibles' }
  }
}

function IconButton({ title, onClick, children, disabled }) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`p-3 rounded-full text-black bg-gray-100 from-gray-200 to-white shadow-sm transition duration-150 ease-out hover:from-gray-300 hover:to-white focus:outline-none focus:ring-2 focus:ring-blue-500 active:scale-[0.98] ${disabled ? 'opacity-50 cursor-not-allowed hover:from-gray-200 hover:to-white active:scale-100' : ''}`}
    >
      {children}
    </button>
  )
}

export default function Translate() {
  const languageOptions = useMemo(() => [...BASIC_LANGUAGES, CUSTOM_LANGUAGE], [])

  const [sourceLang, setSourceLang] = useState('es')
  const [targetLang, setTargetLang] = useState('it')
  const [sourceText, setSourceText] = useState('hola, como estas')
  const [resultText, setResultText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [alternatives, setAlternatives] = useState([])
  const [detectedLang, setDetectedLang] = useState(null)
  const [listening, setListening] = useState(false)
  const [speechError, setSpeechError] = useState(null)
  const textAreaRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const [recording, setRecording] = useState(false)
  // Animación de habla y toast
  const [speakingSource, setSpeakingSource] = useState(false)
  const [speakingResult, setSpeakingResult] = useState(false)
  const [toastMessage, setToastMessage] = useState(null)
  const showToast = (msg) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 1800)
  }
  const STT_PROVIDER = import.meta.env.VITE_STT_PROVIDER || null // 'wit' | 'hf'
  const WIT_TOKEN = import.meta.env.VITE_WIT_TOKEN || null
  const HF_TOKEN = import.meta.env.VITE_HF_TOKEN || null

  const isSafari = (() => {
    const ua = navigator.userAgent
    const isSafariBrowser = /Safari/.test(ua) && !/Chrome|Chromium|Edg/.test(ua)
    return isSafariBrowser
  })()

  const langToLocale = (code) => {
    switch(code){
      case 'es': return 'es-ES'
      case 'en': return 'en-US'
      case 'fr': return 'fr-FR'
      case 'de': return 'de-DE'
      case 'it': return 'it-IT'
      case 'pt': return 'pt-PT'
      case 'ru': return 'ru-RU'
      case 'zh': return 'zh-CN'
      case 'ja': return 'ja-JP'
      case 'ko': return 'ko-KR'
      case 'ht': return 'ht-HT'
      default: return code || 'auto'
    }
  }

  const transcribeAudio = async (blob) => {
    try {
      if (STT_PROVIDER === 'wit' && WIT_TOKEN) {
        const res = await fetch('https://api.wit.ai/speech?v=20230601', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${WIT_TOKEN}`,
            'Content-Type': blob.type || 'audio/webm',
            'Accept': 'application/json',
          },
          body: blob,
        })
        const data = await res.json()
        const text = data?.text || ''
        return text
      }
      if (STT_PROVIDER === 'hf' && HF_TOKEN) {
        const res = await fetch('https://api-inference.huggingface.co/models/openai/whisper-large-v3', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${HF_TOKEN}`, 'Content-Type': blob.type || 'audio/webm' },
          body: blob,
        })
        const data = await res.json()
        const text = data?.text || ''
        return text
      }
      throw new Error('Sin proveedor STT configurado')
    } catch (e) {
      setSpeechError('Error al transcribir audio con el servicio elegido')
      return ''
    }
  }

  const startRecording = async () => {
    setSpeechError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const preferredType = (window.MediaRecorder && window.MediaRecorder.isTypeSupported) ?
        (MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : (MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '')) : ''
      const options = preferredType ? { mimeType: preferredType } : undefined
      const recorder = new MediaRecorder(stream, options)
      audioChunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      recorder.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: preferredType || 'audio/webm' })
        const text = await transcribeAudio(blob)
        if (text) setSourceText(text)
        setRecording(false)
        stream.getTracks().forEach(t => t.stop())
      }
      mediaRecorderRef.current = recorder
      recorder.start()
      setRecording(true)
    } catch (e) {
      setSpeechError('No se pudo acceder al micrófono para grabar')
      setRecording(false)
    }
  }

  const stopRecording = () => {
    try {
      mediaRecorderRef.current?.stop()
    } catch {}
  }

  const startListening = () => {
    setSpeechError(null)
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      // Si no hay API nativa, intentar proveedor STT mediante grabación
      if ((STT_PROVIDER === 'wit' && WIT_TOKEN) || (STT_PROVIDER === 'hf' && HF_TOKEN)) {
        startRecording()
        return
      }
      // Fallback UX para Safari: dictado del teclado
      if (isSafari) {
        setSpeechError('Safari no soporta reconocimiento de voz. Usa el micrófono del teclado para dictar.')
        textAreaRef.current?.focus()
      } else {
        setSpeechError('Tu navegador no soporta reconocimiento de voz')
      }
      return
    }
    try {
      const recognition = new SpeechRecognition()
      recognition.lang = langToLocale(sourceLang)
      recognition.continuous = false
      recognition.interimResults = false
      setListening(true)
      recognition.onresult = (e) => {
        const transcript = Array.from(e.results).map(r => r[0].transcript).join(' ')
        setSourceText(transcript)
      }
      recognition.onerror = () => { setSpeechError('Error al reconocer audio') }
      recognition.onend = () => { setListening(false) }
      recognition.start()
    } catch (e) {
      setSpeechError('No se pudo iniciar el micrófono')
      setListening(false)
    }
  }

  const swapLangs = () => {
    setSourceLang(targetLang)
    setTargetLang(sourceLang)
    setResultText('')
  }

  useEffect(() => {
    const base = sourceText.trim()
    if (!base) { setResultText(''); setError(null); setAlternatives([]); setDetectedLang(null); return }
    setLoading(true)
    const id = setTimeout(async () => {
      const result = await translateText(base, sourceLang, targetLang)
      setResultText(result.text)
      setAlternatives(result.alternatives || [])
      setDetectedLang(result.detected || null)
      setError(result.error)
      setLoading(false)
    }, 350)
    return () => clearTimeout(id)
  }, [sourceText, sourceLang, targetLang])

  const copyResult = async () => {
    const text = resultText || ''
    if (!text) { showToast('Nada para copiar'); return }
    try {
      await navigator.clipboard.writeText(text)
      showToast('Texto copiado')
    } catch (e) {
      try {
        const ta = document.createElement('textarea')
        ta.value = text
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.focus()
        ta.select()
        const ok = document.execCommand('copy')
        document.body.removeChild(ta)
        showToast(ok ? 'Texto copiado' : 'No se pudo copiar')
      } catch {
        showToast('No se pudo copiar')
      }
    }
  }

  return (
    <div className="w-full flex items-center justify-center p-4 md:p-6">
      <div className="w-full max-w-md bg-white/90 rounded-2xl shadow-lg ring-1 ring-gray-200 overflow-hidden">
        {/* Header de idiomas */}
        <div className="flex items-center justify-between p-2">
          <div className="flex items-center gap-2 w-full flex-wrap">
            <select
              className="flex-1 min-w-[140px] px-3 py-2 rounded-xl bg-gray-100 text-gray-900 text-sm"
              value={sourceLang}
              onChange={(e) => setSourceLang(e.target.value)}
            >
              {languageOptions.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
            <IconButton title="Intercambiar idiomas" onClick={swapLangs}>
              <FiRepeat size={20} />
            </IconButton>
            <select
              className="flex-1 min-w-[140px] px-3 py-2 rounded-xl bg-gray-100 text-gray-900 text-sm"
              value={targetLang}
              onChange={(e) => setTargetLang(e.target.value)}
            >
              {languageOptions.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
          </div>
          {detectedLang && (
            <div className="w-full mt-2 text-[11px] text-gray-500">Detectado: {detectedLang}</div>
          )}
        </div>

        {/* Entrada */}
        <div className="p-3">
          <label className="text-xs text-gray-500">Texto origen</label>
          <div className="mt-1 flex flex-col gap-3">
            <textarea
              className="flex-1 resize-none rounded-xl p-3 text-gray-900 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[110px] bg-white shadow-sm"
              placeholder="Escribe algo..."
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              ref={textAreaRef}
            />
            <div className="flex w-full justify-end gap-2">
              <IconButton title="Leer" onClick={() => {
                if (!sourceText) return
                const utter = new SpeechSynthesisUtterance(sourceText)
                utter.lang = sourceLang
                utter.onstart = () => setSpeakingSource(true)
                utter.onend = () => setSpeakingSource(false)
                utter.onerror = () => setSpeakingSource(false)
                window.speechSynthesis.speak(utter)
              }}>
                <FiVolume2 size={20} className={speakingSource ? 'animate-pulse text-blue-600' : ''} />
              </IconButton>
              {!recording ? (
                <IconButton
                  title={isSafari && !('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) && !(STT_PROVIDER && (WIT_TOKEN || HF_TOKEN)) ? 'Dictar con teclado (Safari)' : 'Escuchar/Grabar y transcribir'}
                  onClick={startListening}
                >
                  <FiMic size={20} />
                </IconButton>
              ) : (
                <IconButton title="Detener grabación" onClick={stopRecording}>
                  <FiStopCircle size={20} />
                </IconButton>
              )}
            </div>
          </div>
          {listening && (<div className="mt-2 text-[12px] text-blue-600">Escuchando… habla ahora</div>)}
          {recording && (<div className="mt-2 text-[12px] text-blue-600">Grabando… pulsa detener para transcribir</div>)}
          {speechError && (<div className="mt-2 text-[12px] text-red-500">{speechError}</div>)}
        </div>

        {/* Resultado */}
        <div className="p-3">
          <label className="text-xs text-gray-500">Resultado</label>
          <div className="mt-1 flex flex-col gap-3">
            <div className="flex-1 rounded-xl p-3 bg-gray-50 text-gray-900 text-base min-h-[90px] shadow-sm break-words">
              {loading ? <span className="text-gray-400">Traduciendo…</span> : (resultText || <span className="text-gray-400">Sin resultado aún</span>)}
              {error && !loading && (
                <div className="mt-2 text-xs text-red-500">{error}</div>
              )}
              {!!alternatives.length && !loading && (
                <div className="mt-2 text-[12px] text-gray-500">Alternativas: {alternatives.join(', ')}</div>
              )}
            </div>
            <div className="flex w-full justify-end gap-2">
              <IconButton title="Copiar" onClick={copyResult}>
                <FiCopy size={20} />
              </IconButton>
              <IconButton title="Leer" onClick={() => {
                if (!resultText) return
                const utter = new SpeechSynthesisUtterance(resultText)
                utter.lang = targetLang
                utter.onstart = () => setSpeakingResult(true)
                utter.onend = () => setSpeakingResult(false)
                utter.onerror = () => setSpeakingResult(false)
                window.speechSynthesis.speak(utter)
              }}>
                <FiVolume2 size={20} className={speakingResult ? 'animate-pulse text-blue-600' : ''} />
              </IconButton>
            </div>
          </div>
        </div>
        {toastMessage && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-3 py-2 rounded-md shadow-lg text-sm">
            {toastMessage}
          </div>
        )}
      </div>
    </div>
  )
}