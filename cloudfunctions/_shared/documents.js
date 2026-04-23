/**
 * @param {unknown} error
 * @returns {boolean}
 */
function isDocumentNotFoundError(error) {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const message = typeof error.message === 'string' ? error.message : '';
  const code = typeof error.code === 'string' ? error.code : '';

  return (
    code === 'DOCUMENT_NOT_FOUND' ||
    /document(?:\.get)?:fail document with _id .* does not exist/i.test(message)
  );
}

/**
 * @param {{ get: () => Promise<{ data?: Object | null }> }} docRef
 * @returns {Promise<Object|null>}
 */
async function getDocumentOrNull(docRef) {
  try {
    const res = await docRef.get();
    return res && res.data ? res.data : null;
  } catch (error) {
    if (isDocumentNotFoundError(error)) {
      return null;
    }

    throw error;
  }
}

module.exports = {
  isDocumentNotFoundError,
  getDocumentOrNull,
};
