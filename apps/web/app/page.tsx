'use client';

import { useState } from 'react';
import type { PageState } from '../src/state/page-state';
import { submit } from '../src/state/submit';
import { UploadForm } from '../src/components/UploadForm';
import { Processing } from '../src/components/Processing';
import { ResultView } from '../src/components/ResultView';
import { FileRejected } from '../src/components/states/FileRejected';
import { Unreachable } from '../src/components/states/Unreachable';
import { BadShape } from '../src/components/states/BadShape';
import { ServiceRejected } from '../src/components/states/ServiceRejected';

export default function Home() {
  const [state, setState] = useState<PageState>({ kind: 'idle' });

  async function onSubmit(file: File | null) {
    setState({ kind: 'processing', fileName: file?.name ?? 'your document' });
    setState(await submit(file));
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6 sm:p-8">
      <UploadForm onSubmit={onSubmit} disabled={state.kind === 'processing'}>
        {state.kind === 'file_rejected' && <FileRejected reason={state.reason} />}
      </UploadForm>

      <StateView state={state} />
    </main>
  );
}

/**
 * One branch per state, no default case.
 *
 * The exhaustive switch is the structural half of FR-016: adding a variant without rendering
 * it becomes a compile error rather than a silent fallthrough to a generic message. There is
 * deliberately no shared Error component taking a message prop — that is precisely how four
 * distinct situations end up sharing one sentence.
 */
function StateView({ state }: { state: PageState }) {
  switch (state.kind) {
    case 'idle':
      return null;
    case 'file_rejected':
      return null; // rendered inside the form, next to the input that caused it
    case 'processing':
      return <Processing fileName={state.fileName} />;
    case 'result':
      return <ResultView result={state.result} fileName={state.fileName} />;
    case 'unreachable':
      return <Unreachable detail={state.detail} />;
    case 'bad_shape':
      return <BadShape detail={state.detail} />;
    case 'service_rejected':
      return <ServiceRejected message={state.message} />;
  }
}
