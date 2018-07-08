# frozen_string_literal: true

require 'roda'
require_relative 'app'

run App.freeze.app
