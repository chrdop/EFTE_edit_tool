import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KarenzEntry, KarenzEntryKind } from "@workspace/api-client-react";
import { Plus, UserMinus, X } from "lucide-react";

interface KarenzBlockProps {
  entries: KarenzEntry[];
  onChange: (entries: KarenzEntry[]) => void;
  locations: string[];
}

export function newKarenzEntry(locationName: string): KarenzEntry {
  return { kind: KarenzEntryKind.karenz, name: "", locationName, rowNumber: 0, hours: 0, efte: 0 };
}

const numberInputClass =
  "w-full font-mono text-xs [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

export function KarenzBlock({ entries, onChange, locations }: KarenzBlockProps) {
  const update = <K extends keyof KarenzEntry>(index: number, field: K, value: KarenzEntry[K]) => {
    onChange(entries.map((e, i) => (i === index ? { ...e, [field]: value } : e)));
  };

  return (
    <div className="border rounded-lg bg-card shadow-sm overflow-hidden">
      <div className="bg-muted/40 p-4 border-b flex items-center justify-between">
        <div className="flex items-center space-x-2 text-sm font-semibold text-foreground">
          <UserMinus className="w-4 h-4 text-muted-foreground" />
          <span>Karenz / other cluster</span>
        </div>
        <Button onClick={() => onChange([...entries, newKarenzEntry(locations[0] ?? "")])} size="sm" variant="secondary" className="h-8">
          <Plus className="w-4 h-4 mr-1" />
          Add person
        </Button>
      </div>

      <p className="px-4 pt-3 text-xs text-muted-foreground">
        People who are taken out of the <span className="font-semibold text-foreground">original values</span> of one row at one location, before the
        adjustment rules run. <span className="font-semibold text-foreground">Karenz</span>: the entered hours and EFTE are subtracted.{" "}
        <span className="font-semibold text-foreground">Other cluster</span>: the row at that location is set to 0. The effect shows up in the next step
        (columns "− Karenz" and "Basis"). Entries are carried over to the next month's playbook.
      </p>

      {entries.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground">No entries. Click "Add person" or skip this block.</div>
      ) : (
        <div className="overflow-x-auto p-4 pt-3">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="min-w-[130px]">Type</TableHead>
                <TableHead className="min-w-[140px]">Name</TableHead>
                <TableHead className="min-w-[190px]">Location</TableHead>
                <TableHead className="min-w-[80px]">Row</TableHead>
                <TableHead className="min-w-[100px]">Hours</TableHead>
                <TableHead className="min-w-[100px]">EFTE</TableHead>
                <TableHead className="min-w-[150px]">Return (month)</TableHead>
                <TableHead className="w-8"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry, index) => {
                const isCluster = entry.kind === KarenzEntryKind.cluster;
                return (
                  <TableRow key={index}>
                    <TableCell>
                      <Select value={entry.kind} onValueChange={(val) => update(index, "kind", val as KarenzEntryKind)}>
                        <SelectTrigger className="text-xs min-w-[120px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={KarenzEntryKind.karenz} className="text-xs">Karenz</SelectItem>
                          <SelectItem value={KarenzEntryKind.cluster} className="text-xs">Other cluster</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="text"
                        value={entry.name ?? ""}
                        onChange={(e) => update(index, "name", e.target.value)}
                        className="w-full text-xs"
                        placeholder="Name"
                      />
                    </TableCell>
                    <TableCell>
                      <Select value={entry.locationName || ""} onValueChange={(val) => update(index, "locationName", val)}>
                        <SelectTrigger className="text-xs min-w-[170px]">
                          <SelectValue placeholder="Select location…" />
                        </SelectTrigger>
                        <SelectContent>
                          {locations.map((loc) => (
                            <SelectItem key={loc} value={loc} className="text-xs">
                              {loc}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={1}
                        value={entry.rowNumber || ""}
                        onChange={(e) => update(index, "rowNumber", parseInt(e.target.value) || 0)}
                        className={`${numberInputClass} text-sm font-semibold`}
                        placeholder="#"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="any"
                        disabled={isCluster}
                        value={isCluster ? "" : (entry.hours ?? 0)}
                        onChange={(e) => update(index, "hours", isNaN(e.target.valueAsNumber) ? 0 : e.target.valueAsNumber)}
                        className={numberInputClass}
                        placeholder={isCluster ? "row → 0" : "0"}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="any"
                        disabled={isCluster}
                        value={isCluster ? "" : (entry.efte ?? 0)}
                        onChange={(e) => update(index, "efte", isNaN(e.target.valueAsNumber) ? 0 : e.target.valueAsNumber)}
                        className={numberInputClass}
                        placeholder={isCluster ? "row → 0" : "0"}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="month"
                        disabled={isCluster}
                        value={isCluster ? "" : (entry.returnMonth ?? "")}
                        onChange={(e) => update(index, "returnMonth", e.target.value || undefined)}
                        className="w-full text-xs"
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onChange(entries.filter((_, i) => i !== index))}
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
