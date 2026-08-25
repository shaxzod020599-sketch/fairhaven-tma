function runtimeError(code, status = 409) {
  const err = new Error(code);
  err.code = code;
  err.status = status;
  return err;
}

function createPartnerRuntimeManager({ profiles, createContext } = {}) {
  let activeContext = null;

  async function start() {
    if (activeContext) return activeContext;
    const profile = await profiles.getActive();
    if (!profile) throw runtimeError('medicalka_profile_not_configured', 503);
    const candidate = createContext(profile);
    await candidate.start();
    activeContext = candidate;
    return activeContext;
  }

  async function candidateFor(environment) {
    const profile = await profiles.get(environment);
    if (!profile) throw runtimeError('medicalka_profile_not_configured', 404);
    const candidate = createContext(profile);
    try {
      await candidate.start();
      return candidate;
    } catch (err) {
      candidate.stop?.();
      throw err;
    }
  }

  async function ensureSwitchable() {
    if (activeContext && await activeContext.hasInProgress()) {
      throw runtimeError('medicalka_runtime_busy');
    }
  }

  async function replaceCurrent(profile, { persist = false } = {}) {
    await ensureSwitchable();
    const previous = activeContext;
    const candidate = await candidateFor(profile.environment);
    try {
      if (persist) await profiles.setActive(profile.environment);
    } catch (err) {
      candidate.stop?.();
      throw err;
    }
    activeContext = candidate;
    previous?.stop?.();
    return activeContext;
  }

  async function activate(environment) {
    if (activeContext?.environment === environment) return connectionSummary();
    const profile = await profiles.get(environment);
    if (!profile) throw runtimeError('medicalka_profile_not_configured', 404);
    await replaceCurrent(profile, { persist: true });
    return connectionSummary();
  }

  async function updateProfile(input) {
    const saved = await profiles.validateAndSave(input);
    if (activeContext?.environment === input.environment) {
      const profile = await profiles.get(input.environment);
      await replaceCurrent(profile);
    }
    return saved;
  }

  async function setProcessingMode(environment, mode) {
    const saved = await profiles.setProcessingMode(environment, mode);
    if (activeContext?.environment === environment) {
      const profile = await profiles.get(environment);
      await replaceCurrent(profile);
    }
    return saved;
  }

  async function connectionSummary() {
    return {
      activeEnvironment: activeContext?.environment || '',
      profiles: await profiles.listSummaries(),
    };
  }

  function current() {
    return activeContext;
  }

  function stop() {
    activeContext?.stop?.();
    activeContext = null;
  }

  return Object.freeze({
    activate,
    connectionSummary,
    current,
    setProcessingMode,
    start,
    stop,
    updateProfile,
  });
}

module.exports = { createPartnerRuntimeManager };
