@tool
extends EditorPlugin
## Adds the "Guidon" bottom panel. Everything else lives in board.gd.

const Board := preload("res://addons/guidon_tasks/board.gd")

var _board: Control


func _enter_tree() -> void:
	_board = Board.new()
	_board.name = "Guidon"
	add_control_to_bottom_panel(_board, "Guidon")


func _exit_tree() -> void:
	if _board:
		remove_control_from_bottom_panel(_board)
		_board.queue_free()
		_board = null
