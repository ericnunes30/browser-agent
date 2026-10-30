// Package queue implements one FIFO queue per tabId with a single
// in-flight request per tab; different tabs proceed in parallel (SPEC §2, §4).
package queue

import (
	"context"
	"fmt"
)

// Queue is a per-key FIFO mutex: at most one holder per key, waiters are
// admitted in arrival order.
type Queue struct {
	mu    chan struct{} // binary semaphore guarding the fields below (always cap 1)
	busy  map[string]bool
	wait  map[string][]chan struct{}
	depth map[string]int
}

// New returns an empty Queue.
func New() *Queue {
	q := &Queue{
		mu:    make(chan struct{}, 1),
		busy:  make(map[string]bool),
		wait:  make(map[string][]chan struct{}),
		depth: make(map[string]int),
	}
	q.mu <- struct{}{}
	return q
}

func (q *Queue) lock()   { <-q.mu }
func (q *Queue) unlock() { q.mu <- struct{}{} }

// TabKey maps tool args to a queue key. Absent/zero tabId means the active
// tab (§4, §7: never forward 0 to the extension).
func TabKey(args map[string]any) string {
	if args != nil {
		if v, ok := args["tabId"]; ok {
			switch n := v.(type) {
			case float64:
				if n >= 1 {
					return fmt.Sprintf("tab-%d", int64(n))
				}
			case int:
				if n >= 1 {
					return fmt.Sprintf("tab-%d", n)
				}
			case int64:
				if n >= 1 {
					return fmt.Sprintf("tab-%d", n)
				}
			}
		}
	}
	return "active"
}

// Acquire blocks until the caller holds the key (FIFO order).
func (q *Queue) Acquire(key string) {
	_ = q.AcquireContext(context.Background(), key)
}

// AcquireContext blocks until the caller holds the key or ctx is done.
func (q *Queue) AcquireContext(ctx context.Context, key string) error {
	q.lock()
	if !q.busy[key] {
		q.busy[key] = true
		q.unlock()
		return nil
	}
	ch := make(chan struct{})
	q.wait[key] = append(q.wait[key], ch)
	q.depth[key]++
	q.unlock()

	select {
	case <-ctx.Done():
		q.lock()
		// Remove ourselves from the waiter line.
		line := q.wait[key]
		for i, c := range line {
			if c == ch {
				q.wait[key] = append(line[:i], line[i+1:]...)
				q.depth[key]--
				break
			}
		}
		q.unlock()
		return ctx.Err()
	case <-ch:
		return nil
	}
}

// Release hands the key to the next FIFO waiter, or frees it.
func (q *Queue) Release(key string) {
	q.lock()
	defer q.unlock()
	line := q.wait[key]
	if len(line) == 0 {
		q.busy[key] = false
		return
	}
	next := line[0]
	q.wait[key] = line[1:]
	q.depth[key]--
	// busy stays true: ownership passes to the woken waiter.
	close(next)
}

// Depth returns the number of waiters queued for key (diagnostics).
func (q *Queue) Depth(key string) int {
	q.lock()
	defer q.unlock()
	return q.depth[key]
}
