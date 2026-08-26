export class BackgroundWork {
  private active = 0;
  private idleWaiters = new Set<() => void>();

  track<T>(operation: Promise<T>): Promise<T> {
    this.active += 1;
    return operation.finally(() => {
      this.active -= 1;
      this.notifyIfIdle();
    });
  }

  isBusy(): boolean {
    return this.active > 0;
  }

  waitForIdle(): Promise<void> {
    if (!this.isBusy()) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.add(resolve));
  }

  private notifyIfIdle(): void {
    if (this.isBusy()) return;
    for (const resolve of this.idleWaiters) resolve();
    this.idleWaiters.clear();
  }
}
