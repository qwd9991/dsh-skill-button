import React, { useState, useEffect, useRef } from 'react'

export const inject = ['slots', 'remote', 'remote.skills', 'sessions']

interface SkillItem {
  name: string
  description: string
}

// Fallback list shown only when the host skill registry is unreachable.
// The real installed skill list is fetched from the host via `remote.skills.list`.
const DEFAULT_SKILLS: SkillItem[] = []

const FAVORITES_STORAGE_KEY = 'dsh_favorite_skills'
const TRANSLATE_STORAGE_KEY = 'dsh_skill_translate_enabled'
const LLM_CACHE_STORAGE_KEY = 'dsh_skill_llm_translations_cache'

// Universal rule-based lexical dictionary for translating ANY user's custom skills.
// Keys are the word tokens used in `kebab-case` skill names (e.g. "code-review"); values are zh-CN.
const WORD_DICT: Record<string, string> = {
  using: '使用',
  superpowers: '超级力量',
  superpower: '超级力量',
  brainstorming: '头脑风暴',
  brainstorm: '头脑风暴',
  design: '设计',
  search: '搜索',
  multi: '多引擎',
  find: '查找',
  skills: '技能',
  skill: '技能',
  writing: '编写',
  executing: '执行',
  plans: '计划',
  plan: '计划',
  verification: '校验',
  before: '完成前',
  completion: '完成前',
  subagent: '子Agent',
  driven: '驱动',
  development: '开发',
  dev: '开发',
  testing: '测试',
  test: '测试',
  editor: '编辑器',
  edit: '编辑',
  code: '代码',
  review: '审查',
  reviewer: '审查器',
  manager: '管理器',
  manage: '管理',
  analyzer: '分析器',
  analyze: '分析',
  generator: '生成器',
  generate: '生成',
  helper: '助手',
  tool: '工具',
  tools: '工具',
  workflow: '工作流',
  builder: '构建器',
  build: '构建',
  checker: '检查器',
  check: '检查',
  deploy: '部署',
  api: '接口',
  data: '数据',
  image: '图片',
  file: '文件',
}

function autoTranslateSkillName(name: string): string {
  const words = name.split(/[-_]+/)
  const translatedWords = words.map((w) => {
    const lower = w.toLowerCase()
    return WORD_DICT[lower] || (w.charAt(0).toUpperCase() + w.slice(1))
  })
  const hasChinese = translatedWords.some((w) => /[\u4e00-\u9fa5]/.test(w))
  if (hasChinese) {
    return `${translatedWords.join('')} (${name})`
  }
  return name
}

function getLlmTranslationCache(): Record<string, { zhName: string; zhDesc: string }> {
  try {
    const raw = localStorage.getItem(LLM_CACHE_STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveLlmTranslationCache(cache: Record<string, { zhName: string; zhDesc: string }>) {
  try {
    localStorage.setItem(LLM_CACHE_STORAGE_KEY, JSON.stringify(cache))
  } catch {}
}

function getComposerText(): string {
  try {
    const editable = document.querySelector('[contenteditable="true"]')
    if (editable && editable.textContent) return editable.textContent
    const ta = document.querySelector('textarea')
    if (ta && ta.value) return ta.value
  } catch {}
  return ''
}

function isSkillInComposer(skillName: string, composerText: string): boolean {
  if (!composerText) return false
  const escaped = skillName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|\\s|/)${escaped}(?:\\s|/|$)`, 'i').test(composerText)
}

function focusComposerEnd() {
  setTimeout(() => {
    try {
      const editable = document.querySelector('[contenteditable="true"]') as HTMLElement | null
      const textarea = document.querySelector('textarea') as HTMLTextAreaElement | null

      if (editable) {
        editable.focus()
        const selection = window.getSelection()
        if (selection) {
          const range = document.createRange()
          range.selectNodeContents(editable)
          range.collapse(false) // Position cursor at the very end of content
          selection.removeAllRanges()
          selection.addRange(range)
        }
      } else if (textarea) {
        textarea.focus()
        const len = textarea.value.length
        textarea.setSelectionRange(len, len)
      }
    } catch (e) {
      console.warn('[skill-button] focusComposerEnd error:', e)
    }
  }, 40)
}

function SkillPickerButton({ ctx, sessionId }: { ctx: any; sessionId?: string }) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [skills, setSkills] = useState<SkillItem[]>(DEFAULT_SKILLS)
  const [composerText, setComposerText] = useState('')
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(FAVORITES_STORAGE_KEY)
      return stored ? new Set(JSON.parse(stored)) : new Set()
    } catch {
      return new Set()
    }
  })
  const [translateEnabled, setTranslateEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem(TRANSLATE_STORAGE_KEY) === 'true'
    } catch {
      return false
    }
  })
  const [llmCache, setLlmCache] = useState<Record<string, { zhName: string; zhDesc: string }>>(getLlmTranslationCache)
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearchExpanded, setIsSearchExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Asynchronous LLM translator: host model first, free API fallback
  useEffect(() => {
    if (!open || !translateEnabled) return

    let isSubscribed = true

    async function translateSkill(skill: SkillItem) {
      if (!skill.name || !skill.description) return

      // 1. Name translation: always use offline rule engine (instant, reliable)
      let zhName = autoTranslateSkillName(skill.name)
      let zhDesc = ''

      // 2. First try the host translation endpoint, which uses the user's
      //    configured DSH model (the model shown in Settings / composer seat).
      if (isSubscribed) {
        try {
          const res = await fetch('/skill-button/api/translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: skill.name, description: skill.description, sessionId }),
          }).catch(() => null)
          if (res && res.ok) {
            const data = await res.json()
            if (data?.ok) {
              if (data.zhName) zhName = data.zhName
              if (data.zhDesc) zhDesc = data.zhDesc
            }
          }
        } catch (e) {
          console.warn('[skill-button] host translate fallback for:', skill.name, e)
        }
      }

      // 3. Fallback: free translation API (no key required, verified working).
      //    Chunk long descriptions to stay within the API's URL-safe length limit.
      if (!zhDesc) {
        try {
          const raw = skill.description.trim()
          if (raw) {
            const MAX_CHARS = 480
            const parts = raw.length > MAX_CHARS
              ? raw.match(/[^.!?。！？]+[.!?。！？]*/g) || [raw]
              : [raw]
            const translatedParts: string[] = []
            let current = ''
            for (const part of parts) {
              if ((current + part).length > MAX_CHARS && current) {
                translatedParts.push(current)
                current = ''
              }
              current += part
            }
            if (current) translatedParts.push(current)

            const translatedChunks: string[] = []
            for (const chunk of translatedParts) {
              const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=en|zh-CN`
              const res = await fetch(url).catch(() => null)
              if (res && res.ok) {
                const data = await res.json()
                const translated = data?.responseData?.translatedText
                if (typeof translated === 'string' && translated.trim()) {
                  translatedChunks.push(translated.trim())
                }
              }
            }
            if (translatedChunks.length > 0) {
              zhDesc = translatedChunks.join('')
            }
          }
        } catch (e) {
          console.warn('[skill-button] free translation fallback for:', skill.name, e)
        }
      }

      if (isSubscribed && zhDesc) {
        const updatedCache = {
          ...getLlmTranslationCache(),
          [skill.name]: { zhName, zhDesc },
        }
        saveLlmTranslationCache(updatedCache)
        setLlmCache(updatedCache)
      }
    }

    async function translateUncachedSkills() {
      const currentCache = getLlmTranslationCache()
      const uncached = skills.filter((s) => !currentCache[s.name])
      for (const skill of uncached) {
        if (!isSubscribed) break
        await translateSkill(skill)
      }
    }

    translateUncachedSkills()

    return () => {
      isSubscribed = false
    }
  }, [open, translateEnabled, skills])

  const toggleTranslate = () => {
    setTranslateEnabled((prev) => {
      const next = !prev
      try {
        localStorage.setItem(TRANSLATE_STORAGE_KEY, String(next))
      } catch {}
      return next
    })
  }

  // Save favorites to localStorage
  const toggleFavorite = (e: React.MouseEvent, skillName: string) => {
    e.stopPropagation()
    setFavorites((prev) => {
      const next = new Set(prev)
      if (next.has(skillName)) {
        next.delete(skillName)
      } else {
        next.add(skillName)
      }
      try {
        localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(Array.from(next)))
      } catch (err) {
        console.warn('[skill-button] failed to save favorites:', err)
      }
      return next
    })
  }

  // Fetch real-time installed skills from DSH host
  useEffect(() => {
    let cancelled = false
    async function loadSkills() {
      const skillsApi = ctx?.remote?.skills
      if (!skillsApi || !sessionId) return
      try {
        setLoading(true)
        const result = await skillsApi.list({ sessionId })
        if (!cancelled && result && result.ok && Array.isArray(result.value?.skills)) {
          const fetched: SkillItem[] = result.value.skills.map((s: any) => ({
            name: s.name,
            description: s.description || '已安装技能',
          }))
          if (fetched.length > 0) {
            setSkills(fetched)
          }
        }
      } catch (e) {
        console.warn('[skill-button] dynamic skill list fetch failed:', e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    if (open || sessionId) {
      loadSkills()
    }
    return () => {
      cancelled = true
    }
  }, [open, sessionId, ctx])

  // Refresh current composer text whenever popover opens or periodically
  useEffect(() => {
    if (open) {
      setComposerText(getComposerText())
    }
  }, [open])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
    } else {
      setSearchQuery('')
      setIsSearchExpanded(false)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open])

  // Listen to session scope for message submission / draft clearing events if available
  useEffect(() => {
    if (!sessionId || !ctx?.sessions) return
    try {
      const actx = ctx.sessions.scope(sessionId)
      if (actx && typeof actx.on === 'function') {
        const unoff = actx.on('conversation/submit', () => {
          setSelected(new Set())
          setComposerText('')
        })
        return () => {
          try { unoff() } catch {}
        }
      }
    } catch {}
  }, [sessionId, ctx])

  const toggleSkill = (skillName: string) => {
    // If skill is already present in composer, do not re-add to pending insertion list
    const currentText = getComposerText()
    if (isSkillInComposer(skillName, currentText)) {
      return
    }

    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(skillName)) {
        next.delete(skillName)
      } else {
        next.add(skillName)
      }
      return next
    })
  }

  const handleInsertToComposer = () => {
    const currentText = getComposerText()
    // Filter out skills that are already in the composer text to prevent duplicates
    const skillsToInsert = Array.from(selected).filter((name) => !isSkillInComposer(name, currentText))
    if (skillsToInsert.length === 0) {
      setSelected(new Set())
      setOpen(false)
      focusComposerEnd()
      return
    }

    const textToInsert = skillsToInsert.map((name) => `/${name}`).join(' ') + ' '
    let inserted = false

    // 1. Try DSH session scope event ("slash/input-insert-text")
    if (sessionId && ctx?.sessions) {
      try {
        const actx = ctx.sessions.scope(sessionId)
        if (actx && typeof actx.bail === 'function') {
          const res = actx.bail(actx, 'slash/input-insert-text', { text: textToInsert })
          if (res === true) inserted = true
        }
      } catch (e) {
        console.warn('[skill-button] actx insert failed:', e)
      }
    }

    // 2. Fallback: DOM insertion for ContentEditable / Textarea
    if (!inserted) {
      const editable = document.querySelector('[contenteditable="true"]') as HTMLElement | null
      const textarea = document.querySelector('textarea') as HTMLTextAreaElement | null

      if (editable) {
        editable.focus()
        try {
          document.execCommand('insertText', false, textToInsert)
          inserted = true
        } catch {
          editable.innerText += textToInsert
        }
      } else if (textarea) {
        textarea.focus()
        const start = textarea.selectionStart ?? textarea.value.length
        const end = textarea.selectionEnd ?? textarea.value.length
        const currentValue = textarea.value
        textarea.value = currentValue.slice(0, start) + textToInsert + currentValue.slice(end)
        textarea.selectionStart = textarea.selectionEnd = start + textToInsert.length
        textarea.dispatchEvent(new Event('input', { bubbles: true }))
      }
    }

    // Move focus and cursor to the VERY END of all inserted content
    focusComposerEnd()

    // Reset selected skills and refresh composer text
    setSelected(new Set())
    setComposerText(getComposerText())
    setSearchQuery('')
    setIsSearchExpanded(false)
    setOpen(false)
  }

  const handleClear = () => {
    setSelected(new Set())
  }

  // Helper to format display name & description based on translateEnabled
  const getSkillDisplay = (skill: SkillItem) => {
    if (!translateEnabled) {
      return { name: skill.name, description: skill.description }
    }
    // 1. LLM Cache
    const cached = llmCache[skill.name]
    if (cached) {
      return { name: cached.zhName, description: cached.zhDesc }
    }
    // 2. Rule-based automatic fallback
    const autoTranslatedName = autoTranslateSkillName(skill.name)
    return { name: autoTranslatedName, description: skill.description }
  }

  // Filter & Sort skills: Favorites come FIRST
  const filteredSkills = skills
    .filter((s) => {
      if (!searchQuery.trim()) return true
      const q = searchQuery.toLowerCase().trim()
      const display = getSkillDisplay(s)
      return (
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        display.name.toLowerCase().includes(q) ||
        display.description.toLowerCase().includes(q)
      )
    })
    .sort((a, b) => {
      const isFavA = favorites.has(a.name) ? 1 : 0
      const isFavB = favorites.has(b.name) ? 1 : 0
      if (isFavA !== isFavB) return isFavB - isFavA // Favorites first
      return 0
    })

  const isSearching = isSearchExpanded || searchQuery.length > 0

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      {/* Trigger Button styled matching permission selector */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          height: '30px',
          padding: '0 12px',
          borderRadius: '15px',
          background: selected.size > 0 ? 'var(--dsw-alias-bg-module-platform, #e4e4e7)' : 'transparent',
          border: '1px solid var(--dsw-alias-border-l1, #e4e4e7)',
          color: 'var(--dsw-alias-label-primary, #18181b)',
          fontSize: '13px',
          fontWeight: 500,
          cursor: 'pointer',
          transition: 'all 0.15s ease',
          userSelect: 'none',
        }}
      >
        {/* Shield Icon matching permission selector */}
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M8 1.5L2.5 4v4.5c0 3.5 2.5 6.5 5.5 7 3-.5 5.5-3.5 5.5-7V4L8 1.5z" />
          <path d="M6 8l1.5 1.5L10.5 6" />
        </svg>
        <span>{selected.size > 0 ? `技能 (${selected.size})` : '技能'}</span>
        {/* Chevron Icon */}
        <svg
          width="12"
          height="12"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }}
        >
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>

      {/* Multi-Select Dropdown Popover */}
      {open && (
        <div
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 8px)',
            left: 0,
            width: '330px',
            maxHeight: '400px',
            background: 'var(--dsw-alias-bg-base, #ffffff)',
            border: '1px solid var(--dsw-alias-border-l1, #e4e4e7)',
            borderRadius: '16px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.14)',
            padding: '12px',
            zIndex: 99999,
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          {/* Header Row with Title, Translation Switch & Search */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: '28px', gap: '6px' }}>
            {!isSearching ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--dsw-alias-label-primary, #18181b)' }}>
                    技能选择
                  </span>
                  {/* Translation Switch Button */}
                  <button
                    type="button"
                    onClick={toggleTranslate}
                    title={translateEnabled
                      ? '已开启智能翻译 (点击切换原文)。宿主模型不可用时，技能描述会发送至 mymemory.translated.net'
                      : '点击开启智能翻译'}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '3px',
                      height: '22px',
                      padding: '0 6px',
                      borderRadius: '6px',
                      border: translateEnabled ? 'none' : '1px solid var(--dsw-alias-border-l2, #e4e4e7)',
                      background: translateEnabled ? 'var(--dsw-alias-brand-primary, #2563eb)' : 'var(--dsw-alias-interactive-bg-hover, #f4f4f5)',
                      color: translateEnabled ? '#ffffff' : 'var(--dsw-alias-label-secondary, #71717a)',
                      fontSize: '11px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      userSelect: 'none',
                    }}
                  >
                    <span>译</span>
                    <span style={{ fontSize: '9px', opacity: 0.8 }}>{translateEnabled ? 'ON' : 'OFF'}</span>
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {selected.size > 0 ? (
                    <span style={{ fontSize: '11px', background: 'var(--dsw-alias-interactive-bg-hover, #e4e4e7)', padding: '2px 6px', borderRadius: '10px', color: 'var(--dsw-alias-label-secondary, #71717a)' }}>
                      已选 {selected.size}
                    </span>
                  ) : loading ? (
                    <span style={{ fontSize: '11px', color: 'var(--dsw-alias-label-tertiary, #a1a1aa)' }}>
                      刷新中...
                    </span>
                  ) : null}

                  {/* Compact Search Trigger Icon Button */}
                  <button
                    type="button"
                    onClick={() => {
                      setIsSearchExpanded(true)
                      setTimeout(() => searchInputRef.current?.focus(), 50)
                    }}
                    title="搜索技能"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      height: '24px',
                      padding: '0 8px',
                      borderRadius: '12px',
                      background: 'var(--dsw-alias-interactive-bg-hover, #f4f4f5)',
                      border: '1px solid var(--dsw-alias-border-l2, #e4e4e7)',
                      color: 'var(--dsw-alias-label-secondary, #71717a)',
                      fontSize: '11px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <circle cx="6.5" cy="6.5" r="4.5" />
                      <path d="M10 10l3.5 3.5" />
                    </svg>
                    <span>搜索</span>
                  </button>
                </div>
              </>
            ) : (
              /* Expanded Full Search Input Bar */
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  flex: 1,
                  padding: '4px 8px',
                  borderRadius: '10px',
                  background: 'var(--dsw-alias-interactive-bg-hover, #f4f4f5)',
                  border: '1px solid var(--dsw-alias-brand-primary, #2563eb)',
                  transition: 'all 0.2s ease',
                }}
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--dsw-alias-brand-primary, #2563eb)', flex: 'none' }}>
                  <circle cx="6.5" cy="6.5" r="4.5" />
                  <path d="M10 10l3.5 3.5" />
                </svg>
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onBlur={() => {
                    if (!searchQuery.trim()) {
                      setIsSearchExpanded(false)
                    }
                  }}
                  placeholder="搜索技能名称或描述..."
                  style={{
                    flex: 1,
                    border: 'none',
                    background: 'transparent',
                    outline: 'none',
                    fontSize: '12px',
                    color: 'var(--dsw-alias-label-primary, #18181b)',
                    padding: '2px 0',
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('')
                    setIsSearchExpanded(false)
                  }}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    padding: '2px',
                    display: 'flex',
                    alignItems: 'center',
                    color: 'var(--dsw-alias-label-tertiary, #a1a1aa)',
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M4 4l8 8M12 4l-8 8" />
                  </svg>
                </button>
              </div>
            )}
          </div>

          {/* Skill List */}
          <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '250px', minHeight: '60px' }}>
            {filteredSkills.length === 0 ? (
              <div style={{ padding: '16px 0', textAlign: 'center', fontSize: '12px', color: 'var(--dsw-alias-label-tertiary, #a1a1aa)' }}>
                未找到匹配的技能
              </div>
            ) : (
              filteredSkills.map((skill) => {
                const display = getSkillDisplay(skill)
                const inComposer = isSkillInComposer(skill.name, composerText)
                const isSelected = selected.has(skill.name) || inComposer
                const isFavorite = favorites.has(skill.name)
                return (
                  <div
                    key={skill.name}
                    onClick={() => toggleSkill(skill.name)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '8px 10px',
                      borderRadius: '10px',
                      background: isSelected ? 'var(--dsw-alias-interactive-bg-hover, #f4f4f5)' : 'transparent',
                      cursor: inComposer ? 'default' : 'pointer',
                      opacity: inComposer ? 0.85 : 1,
                      transition: 'background 0.1s ease',
                    }}
                  >
                    {/* Check / Shield Icon on Left */}
                    <div style={{ color: isSelected ? 'var(--dsw-alias-brand-primary, #2563eb)' : 'var(--dsw-alias-label-tertiary, #a1a1aa)', flex: 'none' }}>
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M8 1.5L2.5 4v4.5c0 3.5 2.5 6.5 5.5 7 3-.5 5.5-3.5 5.5-7V4L8 1.5z" />
                      </svg>
                    </div>

                    {/* Skill Info Container */}
                    <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span
                          style={{
                            fontSize: '13px',
                            fontWeight: isSelected ? 600 : 400,
                            color: 'var(--dsw-alias-label-primary, #18181b)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {display.name}
                        </span>
                        {isFavorite && (
                          <span style={{ flex: 'none', fontSize: '10px', color: '#eab308', background: '#fef9c3', padding: '0 4px', borderRadius: '4px', fontWeight: 500 }}>
                            置顶
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--dsw-alias-label-tertiary, #71717a)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {display.description}
                      </div>
                    </div>

                    {/* Right Actions Block: '已选' badge + Favorite Star + Checkmark */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 'none' }}>
                      {inComposer && (
                        <span style={{ flex: 'none', whiteSpace: 'nowrap', fontSize: '10px', color: '#16a34a', background: '#dcfce7', padding: '2px 6px', borderRadius: '4px', fontWeight: 500 }}>
                          已选
                        </span>
                      )}

                      {/* Star Favorite Button */}
                      <button
                        type="button"
                        onClick={(e) => toggleFavorite(e, skill.name)}
                        title={isFavorite ? '取消收藏' : '收藏并置顶'}
                        style={{
                          border: 'none',
                          background: 'transparent',
                          cursor: 'pointer',
                          padding: '2px',
                          display: 'flex',
                          alignItems: 'center',
                          flex: 'none',
                          color: isFavorite ? '#f59e0b' : 'var(--dsw-alias-label-caption, #d4d4d8)',
                          transition: 'color 0.15s ease, transform 0.1s ease',
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 16 16" fill={isFavorite ? '#f59e0b' : 'none'} stroke="currentColor" strokeWidth="1.3">
                          <path d="M8 1.5l2.1 4.3 4.7.7-3.4 3.3.8 4.7L8 12.2l-4.2 2.3.8-4.7L1.2 6.5l4.7-.7L8 1.5z" />
                        </svg>
                      </button>

                      {/* Checkmark Icon */}
                      {isSelected && (
                        <div style={{ color: inComposer ? '#16a34a' : 'var(--dsw-alias-brand-primary, #2563eb)', flex: 'none' }}>
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M3.5 8.5L6.5 11.5L12.5 4.5" />
                          </svg>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Footer Actions */}
          <div style={{ display: 'flex', gap: '8px', paddingTop: '8px', borderTop: '1px solid var(--dsw-alias-border-l2, #f4f4f5)' }}>
            <button
              type="button"
              onClick={handleInsertToComposer}
              disabled={selected.size === 0}
              style={{
                flex: 1,
                height: '28px',
                borderRadius: '8px',
                border: 'none',
                background: selected.size > 0 ? 'var(--dsw-alias-brand-primary, #18181b)' : '#e4e4e7',
                color: selected.size > 0 ? '#ffffff' : '#a1a1aa',
                fontSize: '12px',
                fontWeight: 500,
                cursor: selected.size > 0 ? 'pointer' : 'default',
              }}
            >
              使用所选技能
            </button>
            <button
              type="button"
              onClick={handleClear}
              disabled={selected.size === 0}
              style={{
                height: '28px',
                padding: '0 10px',
                borderRadius: '8px',
                border: '1px solid var(--dsw-alias-border-l1, #e4e4e7)',
                background: 'transparent',
                color: 'var(--dsw-alias-label-secondary, #71717a)',
                fontSize: '12px',
                cursor: selected.size > 0 ? 'pointer' : 'default',
              }}
            >
              清空
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export function apply(ctx: any): void {
  ctx.effect(() => {
    return ctx.slots.inject('conversation.input.left', () =>
      ctx.slots.register(
        {
          name: 'conversation.input.left',
          id: '@dsh-external/dsh-skill-button-button',
          order: -10,
          inject: (sessionId: string) => ({ ctx, sessionId }),
        },
        SkillPickerButton,
      ),
    )
  }, '@dsh-external/dsh-skill-button: input button')
}
