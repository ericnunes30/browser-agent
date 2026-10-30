package queue

import (
	"sync"
	"testing"
	"time"
)

func TestSameTabSerializes(t *testing.T) {
	q := New()
	q.Acquire("tab-1")
	entered := make(chan struct{})
	release := make(chan struct{})
	go func() {
		q.Acquire("tab-1")
		close(entered)
		<-release
		q.Release("tab-1")
	}()
	select {
	case <-entered:
		t.Fatal("second holder entered while first holds the tab")
	case <-time.After(50 * time.Millisecond):
	}
	if q.Depth("tab-1") != 1 {
		t.Fatalf("want depth 1, got %d", q.Depth("tab-1"))
	}
	q.Release("tab-1")
	select {
	case <-entered:
	case <-time.After(time.Second):
		t.Fatal("waiter not admitted after release")
	}
	close(release)
}

func TestDifferentTabsParallel(t *testing.T) {
	q := New()
	q.Acquire("tab-1")
	done := make(chan struct{})
	go func() {
		q.Acquire("tab-2")
		close(done)
		q.Release("tab-2")
	}()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("different tab blocked")
	}
	q.Release("tab-1")
}

func TestTabKey(t *testing.T) {
	if TabKey(nil) != "active" || TabKey(map[string]any{}) != "active" {
		t.Fatal("absent tabId must map to active")
	}
	if TabKey(map[string]any{"tabId": float64(0)}) != "active" {
		t.Fatal("tabId 0 must map to active, never forwarded")
	}
	if TabKey(map[string]any{"tabId": float64(3)}) != "tab-3" {
		t.Fatal("positive tabId must map to tab-N")
	}
}

func TestFIFOOrder(t *testing.T) {
	q := New()
	q.Acquire("k")
	var mu sync.Mutex
	var order []int
	var wg sync.WaitGroup
	for i := 0; i < 3; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			q.Acquire("k")
			mu.Lock()
			order = append(order, i)
			mu.Unlock()
			time.Sleep(5 * time.Millisecond)
			q.Release("k")
		}(i)
		time.Sleep(10 * time.Millisecond) // enforce arrival order 0,1,2
	}
	q.Release("k")
	wg.Wait()
	for i, v := range order {
		if v != i {
			t.Fatalf("FIFO violated: %v", order)
		}
	}
}
